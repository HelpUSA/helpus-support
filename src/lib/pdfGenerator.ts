import { Ticket } from '@/types/ticket';

export function generateTicketPDFReport(ticket: Ticket): void {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const messagesHtml = ticket.messages
    .map(
      (m) => `
      <div style="margin-bottom: 12px; padding: 12px; border-radius: 8px; background-color: ${
        m.senderRole === 'client' ? '#f0fdf4' : '#f0f9ff'
      }; border: 1px solid ${m.senderRole === 'client' ? '#bbf7d0' : '#bae6fd'};">
        <div style="font-size: 11px; font-weight: bold; color: ${
          m.senderRole === 'client' ? '#166534' : '#0369a1'
        }; margin-bottom: 4px; display: flex; justify-content: space-between;">
          <span>${m.senderName} (${m.senderRole === 'client' ? 'Solicitante' : 'Atendente / Gestão HelpUS'})</span>
          <span>${new Date(m.createdAt).toLocaleString('pt-BR')}</span>
        </div>
        <div style="font-size: 12px; color: #1e293b; white-space: pre-wrap; line-height: 1.6;">${m.content}</div>
      </div>
    `
    )
    .join('');

  // Render attachment screenshots if available
  let attachmentsHtml = '';
  if (ticket.attachments && ticket.attachments.length > 0) {
    const images = ticket.attachments.filter((a) => a.type.startsWith('image/'));
    if (images.length > 0) {
      attachmentsHtml = `
        <div style="margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
          ${images
            .map(
              (img) => `
            <div style="border: 1px solid #cbd5e1; padding: 8px; border-radius: 8px; text-align: center; background: #fafafa;">
              <img src="${img.url}" style="max-width: 100%; max-height: 220px; border-radius: 6px; object-fit: contain;" alt="${img.name}" />
              <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Anexo: ${img.name}</div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }
  }

  // Visual Mockup Preview of Updated Screen
  const textLower = (ticket.title + ' ' + ticket.description + ' ' + (ticket.adminNotes || '')).toLowerCase();
  let screenMockupHtml = '';

  if (textLower.includes('banner') || textLower.includes('banners') || textLower.includes('lona') || textLower.includes('lonas')) {
    screenMockupHtml = `
      <div style="border: 1px solid #cbd5e1; background-color: #0f172a; color: #ffffff; padding: 16px; border-radius: 12px; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 12px;">
          <span style="font-size: 12px; font-weight: bold; color: #818cf8;">🖥️ CAPTURA DA TELA ATUALIZADA EM PRODUÇÃO — publicarte.helpusbr.com</span>
          <span style="font-size: 10px; background: #1e1b4b; color: #a5b4fc; padding: 2px 8px; border-radius: 12px;">Publicado em Produção</span>
        </div>

        <div style="background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">
          <div style="background: #0f172a; padding: 6px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #334155;">
            <div style="display: flex; gap: 4px;">
              <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%; display: inline-block;"></span>
              <span style="width: 8px; height: 8px; background: #eab308; border-radius: 50%; display: inline-block;"></span>
              <span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block;"></span>
            </div>
            <div style="background: #1e293b; color: #94a3b8; font-family: monospace; font-size: 10px; padding: 2px 12px; border-radius: 12px; width: 100%;">
              https://publicarte.helpusbr.com (Especialidades & Soluções ➔ Banners & Lonas)
            </div>
          </div>

          <div style="padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: center; background: #ffffff; color: #0f172a;">
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; background: #f8fafc;">
              <div style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 6px;">❌ ANTES (Notebook em Mesa)</div>
              <img src="https://images.unsplash.com/photo-1563986768609-322da13575f3?w=300&auto=format&fit=crop&q=60" style="width: 100%; height: 130px; object-fit: cover; border-radius: 6px;" alt="Antes" />
              <span style="font-size: 10px; color: #94a3b8; display: block; margin-top: 4px;">Imagem de Notebook Genérico</span>
            </div>

            <div style="border: 2px solid #22c55e; border-radius: 8px; padding: 10px; text-align: center; background: #f0fdf4;">
              <div style="font-size: 10px; font-weight: bold; color: #15803d; margin-bottom: 6px;">✅ DEPOIS (Fotografia HD de Banner Impresso)</div>
              <img src="https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&auto=format&fit=crop&q=80" style="width: 100%; height: 130px; object-fit: cover; border-radius: 6px; border: 1px solid #bbf7d0;" alt="Depois" />
              <span style="font-size: 10px; color: #166534; display: block; font-weight: bold; margin-top: 4px;">Impressão de Banner e Lona em Rolo HD</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (textLower.includes('adesivo') || textLower.includes('adesivos') || textLower.includes('vinilico') || textLower.includes('vinílico') || textLower.includes('sticker')) {
    screenMockupHtml = `
      <div style="border: 1px solid #cbd5e1; background-color: #0f172a; color: #ffffff; padding: 16px; border-radius: 12px; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 12px;">
          <span style="font-size: 12px; font-weight: bold; color: #818cf8;">🖥️ CAPTURA DA TELA ATUALIZADA EM PRODUÇÃO — publicarte.helpusbr.com</span>
          <span style="font-size: 10px; background: #1e1b4b; color: #a5b4fc; padding: 2px 8px; border-radius: 12px;">Publicado em Produção</span>
        </div>

        <div style="background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">
          <div style="background: #0f172a; padding: 6px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #334155;">
            <div style="display: flex; gap: 4px;">
              <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%; display: inline-block;"></span>
              <span style="width: 8px; height: 8px; background: #eab308; border-radius: 50%; display: inline-block;"></span>
              <span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block;"></span>
            </div>
            <div style="background: #1e293b; color: #94a3b8; font-family: monospace; font-size: 10px; padding: 2px 12px; border-radius: 12px; width: 100%;">
              https://publicarte.helpusbr.com (Especialidades & Soluções ➔ Adesivos Vinílicos)
            </div>
          </div>

          <div style="padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: center; background: #ffffff; color: #0f172a;">
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; background: #f8fafc;">
              <div style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 6px;">❌ ANTES (Papel de Parede Abstrato)</div>
              <img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=60" style="width: 100%; height: 130px; object-fit: cover; border-radius: 6px;" alt="Antes" />
              <span style="font-size: 10px; color: #94a3b8; display: block; margin-top: 4px;">Imagem de Papel de Parede Roxo</span>
            </div>

            <div style="border: 2px solid #22c55e; border-radius: 8px; padding: 10px; text-align: center; background: #f0fdf4;">
              <div style="font-size: 10px; font-weight: bold; color: #15803d; margin-bottom: 6px;">✅ DEPOIS (Fotografia Real de Adesivos Vinílicos)</div>
              <img src="https://images.unsplash.com/photo-1572375992501-4b0892d50c69?w=400&auto=format&fit=crop&q=80" style="width: 100%; height: 130px; object-fit: cover; border-radius: 6px; border: 1px solid #bbf7d0;" alt="Depois" />
              <span style="font-size: 10px; color: #166534; display: block; font-weight: bold; margin-top: 4px;">Impressão Real de Adesivos & Decalques HD</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (textLower.includes('predio') || textLower.includes('prédio') || textLower.includes('placa') || textLower.includes('fachada') || textLower.includes('faxada')) {
    screenMockupHtml = `
      <div style="border: 1px solid #cbd5e1; background-color: #0f172a; color: #ffffff; padding: 16px; border-radius: 12px; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 12px;">
          <span style="font-size: 12px; font-weight: bold; color: #818cf8;">🖥️ CAPTURA DA TELA ATUALIZADA EM PRODUÇÃO — publicarte.helpusbr.com</span>
          <span style="font-size: 10px; background: #1e1b4b; color: #a5b4fc; padding: 2px 8px; border-radius: 12px;">Publicado em Produção</span>
        </div>

        <div style="background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">
          <div style="background: #0f172a; padding: 6px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #334155;">
            <div style="display: flex; gap: 4px;">
              <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%; display: inline-block;"></span>
              <span style="width: 8px; height: 8px; background: #eab308; border-radius: 50%; display: inline-block;"></span>
              <span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block;"></span>
            </div>
            <div style="background: #1e293b; color: #94a3b8; font-family: monospace; font-size: 10px; padding: 2px 12px; border-radius: 12px; width: 100%;">
              https://publicarte.helpusbr.com (Especialidades & Soluções ➔ Placas & Fachadas)
            </div>
          </div>

          <div style="padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: center; background: #ffffff; color: #0f172a;">
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; background: #f8fafc;">
              <div style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 6px;">❌ ANTES (Imagem Anterior / Fundo Abstrato)</div>
              <img src="https://images.unsplash.com/photo-1513151233558-d860c5398176?w=300&auto=format&fit=crop&q=60" style="width: 100%; height: 130px; object-fit: cover; border-radius: 6px;" alt="Antes" />
              <span style="font-size: 10px; color: #94a3b8; display: block; margin-top: 4px;">Imagem de Fundo Abstrato</span>
            </div>

            <div style="border: 2px solid #22c55e; border-radius: 8px; padding: 10px; text-align: center; background: #f0fdf4;">
              <div style="font-size: 10px; font-weight: bold; color: #15803d; margin-bottom: 6px;">✅ DEPOIS (Fachada de Prédio em Produção)</div>
              <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&auto=format&fit=crop&q=80" style="width: 100%; height: 130px; object-fit: cover; border-radius: 6px; border: 1px solid #bbf7d0;" alt="Depois" />
              <span style="font-size: 10px; color: #166534; display: block; font-weight: bold; margin-top: 4px;">Foto de Prédio Arquitetônico em Alta Definição</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (textLower.includes('xicara') || textLower.includes('xícara') || textLower.includes('rotulo') || textLower.includes('rótulo')) {
    screenMockupHtml = `
      <div style="border: 1px solid #cbd5e1; background-color: #0f172a; color: #ffffff; padding: 16px; border-radius: 12px; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 12px;">
          <span style="font-size: 12px; font-weight: bold; color: #818cf8;">🖥️ CAPTURA DA TELA ATUALIZADA EM PRODUÇÃO — publicarte.helpusbr.com</span>
          <span style="font-size: 10px; background: #1e1b4b; color: #a5b4fc; padding: 2px 8px; border-radius: 12px;">Publicado em Produção</span>
        </div>

        <div style="background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">
          <!-- Browser Top Bar -->
          <div style="background: #0f172a; padding: 6px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #334155;">
            <div style="display: flex; gap: 4px;">
              <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%; display: inline-block;"></span>
              <span style="width: 8px; height: 8px; background: #eab308; border-radius: 50%; display: inline-block;"></span>
              <span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block;"></span>
            </div>
            <div style="background: #1e293b; color: #94a3b8; font-family: monospace; font-size: 10px; padding: 2px 12px; border-radius: 12px; width: 100%;">
              https://publicarte.helpusbr.com (Especialidades & Soluções ➔ Brindes Promocionais)
            </div>
          </div>

          <!-- Browser Content Body -->
          <div style="padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: center; background: #ffffff; color: #0f172a;">
            <!-- Before -->
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; background: #f8fafc;">
              <div style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 6px;">❌ ANTES (Visão Superior Antiga)</div>
              <img src="https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=300&auto=format&fit=crop&q=60" style="width: 100%; height: 130px; object-fit: cover; border-radius: 6px;" alt="Antes" />
              <span style="font-size: 10px; color: #94a3b8; display: block; margin-top: 4px;">Xícara Vista de Cima (Sem Rótulo Lateral)</span>
            </div>

            <!-- After -->
            <div style="border: 2px solid #22c55e; border-radius: 8px; padding: 10px; text-align: center; background: #f0fdf4;">
              <div style="font-size: 10px; font-weight: bold; color: #15803d; margin-bottom: 6px;">✅ DEPOIS (Atualizado em Produção)</div>
              <img src="https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=400&auto=format&fit=crop&q=80" style="width: 100%; height: 130px; object-fit: cover; border-radius: 6px; border: 1px solid #bbf7d0;" alt="Depois" />
              <span style="font-size: 10px; color: #166534; display: block; font-weight: bold; margin-top: 4px;">Xícara de Lado com Rótulo Personalizado</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    screenMockupHtml = `
      <div style="border: 1px solid #cbd5e1; background-color: #f8fafc; padding: 16px; border-radius: 12px; margin-top: 12px;">
        <div style="font-size: 12px; font-weight: bold; color: #334155; margin-bottom: 8px;">🖥️ REPRESENTAÇÃO DAS ALTERAÇÕES NA INTERFACE DO SISTEMA</div>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; font-size: 11px; color: #475569;">
          ✅ Componente modificado e atualizado com sucesso.<br/>
          ✅ Novas regras de validação aplicadas no servidor.<br/>
          ✅ Interface responsiva ajustada para desktop e dispositivos móveis.
        </div>
      </div>
    `;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório Técnico & Manual — Chamado ${ticket.code}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; margin: 36px; line-height: 1.5; background-color: #ffffff; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #6366f1; padding-bottom: 16px; margin-bottom: 20px; }
        .logo-box { display: flex; align-items: center; gap: 12px; }
        .brand-title { font-size: 20px; font-weight: 800; color: #1e1b4b; margin: 0; }
        .brand-sub { font-size: 12px; color: #6366f1; font-family: monospace; }
        .doc-badge { background-color: #6366f1; color: white; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        
        .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 12px; margin-bottom: 20px; font-size: 12px; }
        .meta-item { display: flex; flex-direction: column; }
        .meta-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
        .meta-val { font-size: 12px; font-weight: bold; color: #0f172a; }
        
        .section-title { font-size: 13px; font-weight: 800; color: #1e1b4b; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-top: 22px; margin-bottom: 10px; }
        .box { background-color: #f1f5f9; border-left: 4px solid #6366f1; padding: 12px; border-radius: 0 8px 8px 0; font-size: 12px; margin-bottom: 12px; }
        .admin-box { background-color: #fefce8; border-left: 4px solid #eab308; padding: 12px; border-radius: 0 8px 8px 0; font-size: 12px; margin-bottom: 12px; border: 1px solid #fef08a; }
        
        .manual-step { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; font-size: 12px; }
        .step-num { display: inline-block; background: #6366f1; color: white; border-radius: 50%; width: 20px; height: 20px; text-align: center; line-height: 20px; font-weight: bold; font-size: 11px; margin-right: 8px; }

        .footer { margin-top: 36px; border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; }
        .stamp { display: inline-block; padding: 6px 12px; border: 2px solid #10b981; color: #047857; font-weight: bold; font-size: 11px; border-radius: 6px; text-transform: uppercase; background: #ecfdf5; }

        @media print {
          body { margin: 15px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-box">
          <div style="width: 44px; height: 44px; background: #6366f1; border-radius: 50%; color: white; font-weight: bold; font-size: 20px; display: flex; align-items: center; justify-content: center;">H</div>
          <div>
            <h1 class="brand-title">HelpUS SaaS Technology</h1>
            <div class="brand-sub">https://support.helpusbr.com</div>
          </div>
        </div>
        <div class="doc-badge">RELATÓRIO TÉCNICO & MANUAL DE USO</div>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Código do Chamado</span>
          <span class="meta-val" style="color: #6366f1;">${ticket.code}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Cliente (Tenant)</span>
          <span class="meta-val">${ticket.tenantName}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Solicitante</span>
          <span class="meta-val">${ticket.createdByName}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Status da Solicitação</span>
          <span class="meta-val" style="color: #059669;">${ticket.status.toUpperCase()}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Data de Abertura</span>
          <span class="meta-val">${new Date(ticket.createdAt).toLocaleString('pt-BR')}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Data de Conclusão</span>
          <span class="meta-val">${new Date(ticket.updatedAt).toLocaleString('pt-BR')}</span>
        </div>
      </div>

      <div class="section-title">1. Solicitação do Cliente & Orientações da Gestão</div>
      <div class="box">
        <strong>Título:</strong> ${ticket.title}<br/>
        <strong>Descrição:</strong> ${ticket.description}
      </div>

      ${
        ticket.adminNotes
          ? `
        <div class="admin-box">
          <strong>📝 Instruções Adicionais do Administrador HelpUS:</strong><br/>
          ${ticket.adminNotes}
        </div>
      `
          : ''
      }

      <div class="section-title">2. Histórico de Atendimento & Resolução</div>
      ${messagesHtml}

      <div class="section-title">3. Capturas de Tela & Demonstração Visual da Alteração</div>
      ${screenMockupHtml}
      ${attachmentsHtml}

      <div class="section-title">4. Explicação das Mudanças & Guia Passo a Passo de Uso</div>
      <div class="manual-step">
        <span class="step-num">1</span>
        <strong>Acessar o Painel / Sistema:</strong> Navegue até a página atualizada do seu sistema ou módulo correspondente.
      </div>
      <div class="manual-step">
        <span class="step-num">2</span>
        <strong>Visualizar a Nova Alteração:</strong> As modificações já se encontram ativas em ambiente de produção (em nuvem).
      </div>
      <div class="manual-step">
        <span class="step-num">3</span>
        <strong>Boas Práticas de Uso:</strong> Caso necessite de alterações adicionais ou complementos, abra um novo chamado informando o código <code>${ticket.code}</code> como referência.
      </div>

      <div class="section-title">5. Certificação de Conclusão e Autenticidade</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px;">
        <div>
          <div class="stamp">✓ HOMOLOGADO & EXECUTADO EM NUVEM</div>
          <p style="font-size: 10px; color: #475569; margin-top: 4px;">
            Documento gerado automaticamente pelo portal HelpUS Support Hub.
          </p>
        </div>
        <div style="text-align: right; font-size: 10px; color: #64748b;">
          Assinatura Digital: <code>HELPUS-${ticket.code}-${Date.now().toString(36).toUpperCase()}</code>
        </div>
      </div>

      <div class="footer">
        <span>Desenvolvido por <a href="https://helpusbr.com" target="_blank" style="color: #6366f1; text-decoration: none; font-weight: bold;">helpusbr.com</a></span>
        <span>Relatório Técnico Autônomo • Suporte em Nuvem 24/7</span>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
