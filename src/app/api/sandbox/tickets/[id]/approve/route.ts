import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, isAuthorizedSuperAdminEmail } from '@/lib/serverAuth';
import { approveOneSandboxTicket, checkSandboxSnapshot,
  sandboxApprovalGate, SANDBOX_REPO, SANDBOX_PATH, SANDBOX_TARGET } from '@/lib/sandboxApproval';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const HEADERS={'Cache-Control':'no-store, max-age=0','Pragma':'no-cache'};
const API='https://api.github.com/repos/'+SANDBOX_REPO+'/contents/'+SANDBOX_PATH;
function answer(status:number,code:string,message:string){
  return NextResponse.json({success:false,code,error:message,executionDispatched:false},
    {status,headers:HEADERS});
}
export async function POST(request:NextRequest,
  {params}:{params:Promise<{id:string}>}) {
  // Fail closed at the FIRST boundary, before auth or network IO.
  const gate=sandboxApprovalGate(process.env);
  if(!gate.ok)return answer(503,'SANDBOX_APPROVAL_UNAVAILABLE',
    'Aprovacao desativada fora de um ambiente de homologacao isolado.');
  // This staging endpoint is strictly localhost-only; never reachable via Vercel or LAN.
  const hostname=new URL(request.url).hostname;
  if(hostname!=='127.0.0.1')return answer(403,'LOOPBACK_HOST_REQUIRED',
    'Aprovacao apenas no servidor local de homologacao.');
  const {id}=await params;
  if(id!==SANDBOX_TARGET)return answer(404,'SANDBOX_TICKET_ONLY','Chamado de homologacao nao autorizado.');
  // Bearer session only. Reject admin-secret and cookie-only calls; no CSRF path.
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith('Bearer '))
    return answer(401,'SIGNED_MASTER_SESSION_REQUIRED','Sessao Master assinada obrigatoria.');
  const session=verifySessionToken(header.slice(7).trim());
  if(!session || session.role!=='super_admin' || !isAuthorizedSuperAdminEmail(session.email))
    return answer(403,'MASTER_AUTHORIZATION_REQUIRED','Somente Master autenticado pode aprovar.');
  if(request.headers.get('x-superadmin-secret'))
    return answer(403,'LEGACY_SECRET_REJECTED','Autenticacao administrativa legada nao aceita.');
  const headers={
    'Authorization':'Bearer '+gate.token,
    'Accept':'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'HelpUS-Private-Sandbox-Approval'
  };
  try{
    const getResponse=await fetch(API+'?ref=main',{method:'GET',headers,cache:'no-store',
      redirect:'error',signal:AbortSignal.timeout(6500)});
    if(!getResponse.ok)return answer(503,'STAGING_READ_FAILED',
      'Nao foi possivel confirmar a base isolada de homologacao.');
    const doc=await getResponse.json();
    if(doc?.encoding!=='base64'||typeof doc?.sha!=='string'||
       !/^[a-f0-9]{40}$/.test(doc.sha)||doc.content?.length>262144||
       typeof doc.content!=='string'||doc.path!==SANDBOX_PATH)
      return answer(503,'STAGING_DOCUMENT_INVALID','Arquivo de homologacao nao verificavel.');
    const tickets=JSON.parse(Buffer.from(doc.content.replace(/\s+/g,''),'base64').toString('utf8'));
    if(!checkSandboxSnapshot(tickets))return answer(409,'STAGING_DATA_INVALID',
      'Dados diferentes de tickets ficticios detectados. Nenhuma gravacao realizada.');
    const approved=approveOneSandboxTicket(tickets,id,session.email,gate.signingKey);
    if(!approved.ok)return answer(409,approved.reason,'Aprovacao recusada por verificacao de estado.');
    // Optimistic concurrency with exact Git blob SHA. Never retry on conflict.
    const data=Buffer.from(JSON.stringify(approved.tickets,null,2)+'\n').toString('base64');
    const putResponse=await fetch(API,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},
      redirect:'error',signal:AbortSignal.timeout(6500),
      body:JSON.stringify({message:'chore(sandbox): Master-approved SBX event; no dispatch',
        content:data,sha:doc.sha,branch:'main'})});
    if(!putResponse.ok)return answer(putResponse.status===409?409:503,'STAGING_WRITE_UNCONFIRMED',
      'Gravacao nao confirmada. Nenhuma tarefa foi disparada; verifique a origem antes de repetir.');
    const receipt=await putResponse.json();
    if(!receipt?.commit?.sha||!/^[a-f0-9]{40}$/.test(receipt.commit.sha)||
       receipt?.content?.path!==SANDBOX_PATH)
      return answer(503,'STAGING_WRITE_UNVERIFIED',
        'O GitHub nao confirmou commit e caminho esperados. Nenhuma execucao foi iniciada.');
    return NextResponse.json({
      success:true,ticketId:id,status:'in_production',approvalEventId:approved.approvalEventId,
      jobKey:approved.jobKey,stagingCommitSha:receipt.commit.sha,
      executionDispatched:false,deliveryAcknowledged:false,executionVerified:false
    },{status:200,headers:HEADERS});
  }catch(_error){
    return answer(503,'STAGING_BACKEND_UNAVAILABLE',
      'Falha no backend isolado. Nenhuma execucao foi iniciada; confirmar estado remoto.');
  }
}
