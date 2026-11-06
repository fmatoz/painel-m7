const item=$input.first().json;
const lead=item.lead;
if(!lead?.id) throw new Error('Lead não encontrado no CRM.');
const money=v=>v==null?'Não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
const greeting='Oi, '+(hour<12?'bom dia':hour<18?'boa tarde':'boa noite')+'. Tudo bem?';
const lines=[
'🚀 *Lead qualificado M7*',
'',
'*Empresa:* '+lead.company_name,
'*Nota:* '+Number(lead.score).toFixed(1),
'*Sócio/responsável:* '+(lead.partner_name||'Não informado'),
'*Origem:* '+lead.source,
'*Cidade:* '+([lead.city,lead.state].filter(Boolean).join('/')||'Não informada'),
'*Capital social:* '+money(lead.capital_social),
'*Telefone:* '+(lead.phone||'Não informado'),
lead.phone?'*WhatsApp:* https://wa.me/'+String(lead.phone).replace(/\D/g,'')+'?text='+encodeURIComponent(greeting):'',
lead.website?'*Site:* '+lead.website:'',
lead.maps_rating!=null?'*Google Maps:* '+lead.maps_rating+' ★ · '+(lead.maps_reviews||0)+' avaliações':'',
lead.cnpj?'*CNPJ:* '+lead.cnpj:'',
lead.cnae?'*Atividade:* '+lead.cnae:'',
lead.service_interest?'*Serviço sugerido:* '+lead.service_interest:'',
lead.next_action?'*Próxima ação:* '+lead.next_action:''
].filter(Boolean);
return [{json:{commandId:item.command_id,leadId:lead.id,messageText:lines.join('\n')}}];
