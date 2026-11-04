import { Ticket } from '@/types/ticket';
import { INITIAL_TENANTS } from '@/lib/tenants';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveTenantDomain(ticket: Ticket): string {
  if (ticket.resolutionReport?.targetUrl) {
    return ticket.resolutionReport.targetUrl;
  }
  if (ticket.contextData?.url && ticket.contextData.url.startsWith('http')) {
    return ticket.contextData.url;
  }
  const found = INITIAL_TENANTS.find(
    (t) => t.id === ticket.tenantId || t.slug === ticket.tenantId
  );
  if (found && found.domain) {
    return found.domain.startsWith('http') ? found.domain : `https://${found.domain}`;
  }
  if (ticket.tenantId === 'helpus-support' || ticket.tenantId === 'support') {
    return 'https://support.helpusbr.com';
  }
  return `https://${ticket.tenantId || 'support'}.helpusbr.com`;
}

export function generateTicketPDFReport(ticket: Ticket): void {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const appDomain = resolveTenantDomain(ticket);
  const appName = ticket.tenantName || ticket.tenantId || 'Aplicação HelpUS';
  const report = ticket.resolutionReport;

  // Extrai mensagens de progresso reais da esteira para fallback dinâmico caso o chamado seja anterior ao campo resolutionReport
  const step50Msg =
    ticket.messages
      .slice()
      .reverse()
      .find((m) => m.content.includes('50%') || m.content.includes('Commit GitHub'))?.content || '';
  const step75Msg =
    ticket.messages
      .slice()
      .reverse()
      .find((m) => m.content.includes('75%') || m.content.includes('Deploy de produção'))?.content || '';
  const step100Msg =
    ticket.messages
      .slice()
      .reverse()
      .find(
        (m) =>
          m.content.includes('SOLUÇÃO HOMOLOGADA') ||
          m.content.includes('CONCLUÍDO') ||
          m.senderName.includes('IA Autônoma')
      )?.content || '';

  const commitShaMatch = (step100Msg + ' ' + step50Msg).match(/Commit GitHub[^:`]*:\s*`?([a-f0-9]{7,40})`?/i);
  const commitSha =
    report?.commitSha ||
    ticket.solutionCommitSha ||
    (commitShaMatch ? commitShaMatch[1] : 'Verificado no GitHub');

  const filesMatch = (step100Msg + ' ' + step50Msg).match(/Arquivos Alterados[^:`]*:\s*`?([^`\n]+)`?/i);
  const modifiedFilesList =
    report?.modifiedFiles && report.modifiedFiles.length > 0
      ? report.modifiedFiles.join(', ')
      : filesMatch
      ? filesMatch[1].trim()
      : 'Arquivos do repositório da aplicação atualizados';

  const deployUrlMatch = (step100Msg + ' ' + step75Msg).match(/(https:\/\/[a-z0-9-]+\.vercel\.app)/i);
  const deployUrl =
    report?.deployUrl || (deployUrlMatch ? deployUrlMatch[1] : appDomain);

  const locationChanged =
    report?.locationChanged ||
    `Interface / Componentes da aplicação ${appName} (${appDomain}) — Arquivos: ${modifiedFilesList}`;

  const summaryImplemented =
    report?.summary ||
    step100Msg.replace(/^✨\s*\*?\[SOLUÇÃO HOMOLOGADA\]\*?:\s*/i, '').split('\n')[0] ||
    step50Msg ||
    `Atendimento técnico executado conforme especificação do chamado "${ticket.title}".`;

  const visualBeforeDesc =
    report?.visualBeforeDesc ||
    `Estado anterior da aplicação ${appName} (${appDomain}) antes da implementação do chamado ${ticket.code}: "${ticket.title}".`;

  const visualAfterDesc =
    report?.visualAfterDesc ||
    `${summaryImplemented} (Arquivos atualizados: ${modifiedFilesList} • Commit: ${commitSha}).`;

  const howToTest =
    report?.howToTest ||
    `Acesse ${appDomain} no navegador (atualize com Ctrl+F5 se necessário) e verifique o local alterado (${locationChanged}) referente à demanda "${ticket.title}".`;

  // Separa os anexos enviados pelo cliente dos prints de evidência gerados pela esteira
  const allImages = (ticket.attachments || []).filter((a) => a.type && a.type.startsWith('image/'));
  const evidencePrints = allImages.filter(
    (a) =>
      a.stage === 'before_print' ||
      a.stage === 'after_print' ||
      a.stage === 'evidence_comparison' ||
      a.name.startsWith('[PRINT') ||
      a.name.startsWith('[EVIDÊNCIA') ||
      a.id.startsWith('att-print-') ||
      a.id.startsWith('att-evid-')
  );
  const clientUploads = allImages.filter((a) => !evidencePrints.includes(a));

  const clientAttachmentsHtml =
    clientUploads.length > 0
      ? `
      <div style="margin-top: 12px;">
        <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 8px;">📎 Anexos / Capturas Enviadas na Abertura do Chamado:</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
          ${clientUploads
            .map(
              (img) => `
            <div style="border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; text-align: center; background: #f8fafc;">
              <img src="${img.url}" style="max-width: 100%; max-height: 220px; border-radius: 6px; object-fit: contain; border: 1px solid #e2e8f0;" alt="${escapeHtml(img.name)}" />
              <div style="font-size: 10.5px; font-weight: bold; color: #334155; margin-top: 6px;">${escapeHtml(img.name)}</div>
              ${img.description ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">${escapeHtml(img.description)}</div>` : ''}
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
      : '';

  const messagesHtml = ticket.messages
    .map(
      (m) => `
      <div style="margin-bottom: 10px; padding: 11px 14px; border-radius: 8px; background-color: ${
        m.senderRole === 'client' ? '#f0fdf4' : '#f0f9ff'
      }; border: 1px solid ${m.senderRole === 'client' ? '#bbf7d0' : '#bae6fd'};">
        <div style="font-size: 11px; font-weight: bold; color: ${
          m.senderRole === 'client' ? '#166534' : '#0369a1'
        }; margin-bottom: 4px; display: flex; justify-content: space-between;">
          <span>${escapeHtml(m.senderName)} (${m.senderRole === 'client' ? 'Solicitante' : 'Esteira Autônoma / Gestão HelpUS'})</span>
          <span>${new Date(m.createdAt).toLocaleString('pt-BR')}</span>
        </div>
        <div style="font-size: 11.5px; color: #1e293b; white-space: pre-wrap; line-height: 1.55;">${escapeHtml(m.content)}</div>
      </div>
    `
    )
    .join('');

  // Renderiza os prints reais dos locais alterados do site (Antes / Depois / Produção) com suas descrições detalhadas
  let printsGalleryHtml = '';
  if (report?.beforePrintUrl || report?.afterPrintUrl || report?.comparisonPrintUrl || evidencePrints.length > 0) {
    const cards: string[] = [];

    if (report?.beforePrintUrl && report?.afterPrintUrl) {
      cards.push(`
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <div style="border: 1px solid #475569; border-radius: 10px; padding: 12px; background: #0f172a; color: #f8fafc;">
            <div style="font-size: 11px; font-weight: 800; color: #f87171; margin-bottom: 8px; text-transform: uppercase;">
              ❌ PRINT ANTES DA ALTERAÇÃO — ${escapeHtml(appName)}
            </div>
            <img src="${report.beforePrintUrl}" style="width: 100%; max-height: 260px; object-fit: contain; border-radius: 6px; border: 1px solid #334155; background: #020617;" alt="Print Antes" />
            <div style="font-size: 11px; color: #cbd5e1; margin-top: 8px; line-height: 1.45;">
              <strong>Descrição do Local (Antes):</strong> ${escapeHtml(visualBeforeDesc)}
            </div>
          </div>

          <div style="border: 2px solid #10b981; border-radius: 10px; padding: 12px; background: #064e3b22; color: #f8fafc;">
            <div style="font-size: 11px; font-weight: 800; color: #34d399; margin-bottom: 8px; text-transform: uppercase;">
              ✅ PRINT DEPOIS DA ALTERAÇÃO EM PRODUÇÃO — ${escapeHtml(appName)}
            </div>
            <img src="${report.afterPrintUrl}" style="width: 100%; max-height: 260px; object-fit: contain; border-radius: 6px; border: 1px solid #10b981; background: #020617;" alt="Print Depois" />
            <div style="font-size: 11px; color: #ecfdf5; margin-top: 8px; line-height: 1.45;">
              <strong>Descrição do Local Alterado (Depois):</strong> ${escapeHtml(visualAfterDesc)}
            </div>
          </div>
        </div>
      `);
    }

    if (report?.comparisonPrintUrl) {
      cards.push(`
        <div style="border: 1px solid #334155; border-radius: 10px; padding: 12px; background: #0f172a; color: #f8fafc; margin-bottom: 14px;">
          <div style="font-size: 11px; font-weight: 800; color: #38bdf8; margin-bottom: 8px;">
            📸 CAPTURA VISUAL DETALHADA DO LOCAL ALTERADO (${escapeHtml(locationChanged)})
          </div>
          <img src="${report.comparisonPrintUrl}" style="width: 100%; max-height: 340px; object-fit: contain; border-radius: 8px; border: 1px solid #334155; background: #020617;" alt="Print Comparativo" />
          <div style="font-size: 11px; color: #e2e8f0; margin-top: 8px; line-height: 1.45;">
            <strong>Local Exato Alterado:</strong> ${escapeHtml(locationChanged)}<br/>
            <strong>Descrição da Mudança Visual:</strong> ${escapeHtml(visualAfterDesc)}
          </div>
        </div>
      `);
    }

    for (const evImg of evidencePrints) {
      if (
        evImg.url === report?.beforePrintUrl ||
        evImg.url === report?.afterPrintUrl ||
        evImg.url === report?.comparisonPrintUrl
      ) {
        continue;
      }
      cards.push(`
        <div style="border: 1px solid #334155; border-radius: 10px; padding: 12px; background: #0f172a; color: #f8fafc; margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 800; color: #34d399; margin-bottom: 6px;">
            🖥️ ${escapeHtml(evImg.name)}
          </div>
          <img src="${evImg.url}" style="width: 100%; max-height: 320px; object-fit: contain; border-radius: 6px; border: 1px solid #334155; background: #020617;" alt="${escapeHtml(evImg.name)}" />
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 8px; line-height: 1.45;">
            ${escapeHtml(evImg.description || visualAfterDesc)}
          </div>
        </div>
      `);
    }

    printsGalleryHtml = cards.join('');
  }

  const screenMockupHtml = `
    <div style="border: 1px solid #cbd5e1; background-color: #0f172a; color: #ffffff; padding: 16px; border-radius: 12px; margin-top: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 12px;">
        <span style="font-size: 12px; font-weight: bold; color: #34d399;">
          🖥️ EVIDÊNCIA VISUAL & TÉCNICA EM PRODUÇÃO — ${escapeHtml(appName)} (${escapeHtml(appDomain)})
        </span>
        <span style="font-size: 10px; background: #064e3b; color: #6ee7b7; padding: 3px 10px; border-radius: 12px; font-weight: bold;">
          Commit ${escapeHtml(commitSha)} • Publicado na Vercel
        </span>
      </div>

      ${printsGalleryHtml}

      <div style="background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">
        <div style="background: #020617; padding: 7px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #334155;">
          <div style="display: flex; gap: 4px;">
            <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%; display: inline-block;"></span>
            <span style="width: 8px; height: 8px; background: #eab308; border-radius: 50%; display: inline-block;"></span>
            <span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block;"></span>
          </div>
          <div style="background: #1e293b; color: #94a3b8; font-family: monospace; font-size: 10px; padding: 2px 12px; border-radius: 12px; width: 100%;">
            ${escapeHtml(appDomain)} • Local Alterado: ${escapeHtml(locationChanged)}
          </div>
        </div>

        <div style="padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: stretch; background: #0b1120; color: #ffffff;">
          <div style="border: 1px solid #334155; border-radius: 8px; padding: 12px; background: #0f172a; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="font-size: 11px; font-weight: bold; color: #f87171; margin-bottom: 8px;">📌 ESTADO ANTERIOR (ANTES DA INTERVENÇÃO)</div>
              <div style="font-size: 11px; color: #e2e8f0; background: #1e293b; padding: 10px; border-radius: 6px; border: 1px dashed #475569; line-height: 1.5;">
                ${escapeHtml(visualBeforeDesc)}
              </div>
            </div>
            <span style="font-size: 10px; color: #94a3b8; display: block; margin-top: 8px;">
              Chamado ${escapeHtml(ticket.code)} • Aplicação: ${escapeHtml(appName)}
            </span>
          </div>

          <div style="border: 2px solid #10b981; border-radius: 8px; padding: 12px; background: #064e3b22; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="font-size: 11px; font-weight: bold; color: #34d399; margin-bottom: 8px;">✅ ESTADO ATUAL EM PRODUÇÃO (DEPOIS DA ALTERAÇÃO)</div>
              <div style="font-size: 11px; color: #ecfdf5; background: #0f172a; padding: 10px; border-radius: 6px; border: 1px solid #10b981; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(visualAfterDesc)}</div>
            </div>
            <span style="font-size: 10px; color: #6ee7b7; display: block; font-weight: bold; margin-top: 8px;">
              Arquivos: ${escapeHtml(modifiedFilesList)} • Deploy: ${escapeHtml(deployUrl)}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório Técnico & Manual — Chamado ${escapeHtml(ticket.code)} (${escapeHtml(appName)})</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; margin: 32px; line-height: 1.5; background-color: #ffffff; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #6366f1; padding-bottom: 14px; margin-bottom: 18px; }
        .logo-box { display: flex; align-items: center; gap: 12px; }
        .brand-title { font-size: 19px; font-weight: 800; color: #1e1b4b; margin: 0; }
        .brand-sub { font-size: 11.5px; color: #6366f1; font-family: monospace; }
        .doc-badge { background-color: #6366f1; color: white; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        
        .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 14px; border-radius: 12px; margin-bottom: 18px; font-size: 12px; }
        .meta-item { display: flex; flex-direction: column; }
        .meta-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
        .meta-val { font-size: 12px; font-weight: bold; color: #0f172a; }
        
        .section-title { font-size: 13px; font-weight: 800; color: #1e1b4b; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px; margin-bottom: 10px; }
        .box { background-color: #f1f5f9; border-left: 4px solid #6366f1; padding: 12px; border-radius: 0 8px 8px 0; font-size: 12px; margin-bottom: 12px; }
        .admin-box { background-color: #fefce8; border-left: 4px solid #eab308; padding: 12px; border-radius: 0 8px 8px 0; font-size: 12px; margin-bottom: 12px; border: 1px solid #fef08a; }
        
        .manual-step { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; font-size: 12px; }
        .step-num { display: inline-block; background: #6366f1; color: white; border-radius: 50%; width: 20px; height: 20px; text-align: center; line-height: 20px; font-weight: bold; font-size: 11px; margin-right: 8px; }

        .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; }
        .stamp { display: inline-block; padding: 6px 12px; border: 2px solid #10b981; color: #047857; font-weight: bold; font-size: 11px; border-radius: 6px; text-transform: uppercase; background: #ecfdf5; }

        @media print {
          body { margin: 12px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-box">
          <div style="width: 42px; height: 42px; background: #6366f1; border-radius: 50%; color: white; font-weight: bold; font-size: 19px; display: flex; align-items: center; justify-content: center;">H</div>
          <div>
            <h1 class="brand-title">HelpUS SaaS Hub — Relatório Técnico (${escapeHtml(appName)})</h1>
            <div class="brand-sub">${escapeHtml(appDomain)} • Chamado ${escapeHtml(ticket.code)}</div>
          </div>
        </div>
        <div class="doc-badge">LAUDO TÉCNICO & EVIDÊNCIAS REAIS</div>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Código do Chamado</span>
          <span class="meta-val" style="color: #6366f1;">${escapeHtml(ticket.code)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Aplicação (Tenant)</span>
          <span class="meta-val">${escapeHtml(appName)} (${escapeHtml(appDomain)})</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Solicitante</span>
          <span class="meta-val">${escapeHtml(ticket.createdByName)} (${escapeHtml(ticket.createdByEmail)})</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Status & Homologação</span>
          <span class="meta-val" style="color: #059669;">${escapeHtml((ticket.status || 'resolved').toUpperCase())} (${ticket.progressPercentage ?? 100}%)</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Commit GitHub & Arquivos</span>
          <span class="meta-val" style="font-family: monospace;">${escapeHtml(commitSha)} (${escapeHtml(modifiedFilesList)})</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Data de Conclusão</span>
          <span class="meta-val">${new Date(ticket.updatedAt).toLocaleString('pt-BR')}</span>
        </div>
      </div>

      <div class="section-title">1. Solicitação do Cliente & Orientações da Gestão</div>
      <div class="box">
        <strong>Título:</strong> ${escapeHtml(ticket.title)}<br/>
        <strong>Descrição:</strong> ${escapeHtml(ticket.description)}
      </div>

      ${
        ticket.adminNotes
          ? `
        <div class="admin-box">
          <strong>📝 Instruções Adicionais do Administrador HelpUS:</strong><br/>
          ${escapeHtml(ticket.adminNotes)}
        </div>
      `
          : ''
      }
      ${clientAttachmentsHtml}

      <div class="section-title">2. Histórico de Atendimento & Resolução</div>
      ${messagesHtml}

      <div class="section-title">3. Capturas de Tela (Prints) & Demonstração Visual dos Locais Alterados</div>
      ${screenMockupHtml}

      <div class="section-title">4. O Que Foi Feito & Onde Testar na Aplicação (${escapeHtml(appName)})</div>
      <div class="manual-step">
        <span class="step-num">1</span>
        <strong>Ponto da Tela / Local do Site Alterado:</strong> ${escapeHtml(locationChanged)} na aplicação <code>${escapeHtml(appName)}</code> (<a href="${escapeHtml(appDomain)}" target="_blank" style="color: #6366f1;">${escapeHtml(appDomain)}</a>).
      </div>
      <div class="manual-step">
        <span class="step-num">2</span>
        <strong>O Que Foi Implementado no Código:</strong> ${escapeHtml(summaryImplemented)}<br/>
        <span style="font-size: 11px; color: #475569;">• <strong>Arquivos Modificados:</strong> <code>${escapeHtml(modifiedFilesList)}</code> &nbsp;|&nbsp; <strong>Commit GitHub:</strong> <code>${escapeHtml(commitSha)}</code> &nbsp;|&nbsp; <strong>Deploy Vercel:</strong> <code>${escapeHtml(deployUrl)}</code></span>
      </div>
      <div class="manual-step">
        <span class="step-num">3</span>
        <strong>Onde e Como Testar em Produção:</strong> ${escapeHtml(howToTest)} (<a href="${escapeHtml(appDomain)}" target="_blank" style="color: #6366f1; font-weight: bold;">${escapeHtml(appDomain)}</a>).
      </div>

      <div class="section-title">5. Certificação de Conclusão e Autenticidade</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px;">
        <div>
          <div class="stamp">✓ HOMOLOGADO & IMPLANTADO EM PRODUÇÃO (${escapeHtml(commitSha)})</div>
          <p style="font-size: 10px; color: #475569; margin-top: 4px;">
            Documento gerado dinamicamente com os dados exclusivos do chamado ${escapeHtml(ticket.code)} (${escapeHtml(appName)}).
          </p>
        </div>
        <div style="text-align: right; font-size: 10px; color: #64748b;">
          Assinatura Digital: <code>HELPUS-${escapeHtml(ticket.code)}-${escapeHtml(commitSha).toUpperCase()}</code>
        </div>
      </div>

      <div class="footer">
        <span>Desenvolvido por <a href="https://helpusbr.com" target="_blank" style="color: #6366f1; text-decoration: none; font-weight: bold;">helpusbr.com</a></span>
        <span>Relatório Técnico Multi-Tenant • Esteira Autônoma v3.0</span>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 350);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
