import { db } from './db';

const cleanPhone = (phone: string) => {
  return phone.replace(/\D/g, '');
};

const formatMessage = (template: string, params: Record<string, string>) => {
  let msg = template;
  Object.keys(params).forEach(key => {
    msg = msg.replace(`{{${key}}}`, params[key]);
  });
  return msg;
};

export const sendWhatsAppMessage = async (
  phone: string, 
  message: string, 
  type: 'text' | 'reminder' | 'collection' = 'text'
) => {
  const settings = db.getLocalSettings();
  const rawPhone = cleanPhone(phone);
  
  if (!rawPhone) {
    throw new Error("Telefone inválido ou vazio.");
  }

  // Se houver uma API configurada (Ex: Evolution, Z-API, UltraMsg)
  // A lógica abaixo é genérica para APIs que aceitam POST /send-text
  if (settings.whatsappApiUrl && settings.whatsappApiUrl.startsWith('http')) {
    try {
      const response = await fetch(settings.whatsappApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.whatsappApiToken || ''}`,
          'apikey': settings.whatsappApiToken || '' // Alguns usam 'apikey'
        },
        body: JSON.stringify({
          number: rawPhone, // Formato comum: 5511999999999
          phone: rawPhone,
          message: message,
          text: message
        })
      });

      if (!response.ok) {
        throw new Error('Erro na API de WhatsApp. Tentando método Web...');
      }
      
      return { success: true, method: 'api' };
    } catch (error) {
      console.warn("Falha na API WhatsApp, usando fallback web.", error);
      // Fallback to web below
    }
  }

  // Fallback: Abrir WhatsApp Web/App
  // Formato universal: https://wa.me/NUMBER?text=MESSAGE
  const encodedMsg = encodeURIComponent(message);
  // Adiciona 55 se não tiver (assumindo Brasil por padrão se for curto)
  const finalPhone = rawPhone.length <= 11 ? `55${rawPhone}` : rawPhone;
  
  window.open(`https://wa.me/${finalPhone}?text=${encodedMsg}`, '_blank');
  return { success: true, method: 'web' };
};

export const TEMPLATES = {
  reminder: "Olá {{name}}, tudo bem? Passando para lembrar da nossa reunião agendada para {{date}} às {{time}}.",
  collection: "Olá {{name}}. Consta em nosso sistema uma pendência financeira no valor de R$ {{amount}}. Poderia nos dar uma previsão de pagamento? Caso já tenha pago, desconsidere.",
  welcome: "Olá {{name}}, bem-vindo à Nexus Enterprise! É um prazer ter você conosco."
};