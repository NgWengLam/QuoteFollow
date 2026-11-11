import { DEFAULT_RULES } from "./domain.js";

// Message-body presets only. Saved wording uses the existing rule/reminder
// snapshot pipeline, so choosing a preset never rewrites scheduled messages.
export const TEMPLATE_LANGUAGES = [
  { code: "en", label: "English", lang: "en" },
  { code: "ms", label: "Bahasa Melayu", lang: "ms" },
  { code: "zh", label: "中文（简体） · Mandarin", lang: "zh-Hans" },
];
export const FOLLOW_UP_TEMPLATES = {
  en: DEFAULT_RULES.map((rule) => rule.template),
  ms: [
    "Salam {{customer_name}}, kami ingin bertanya sama ada anda sempat menyemak sebut harga {{quote_number}} untuk {{project}}. Jika ada sebarang pertanyaan, kami sedia membantu. — {{business_name}}",
    "Salam {{customer_name}}, kami ingin membuat susulan tentang sebut harga {{quote_number}}. Adakah anda memerlukan penjelasan lanjut tentang skop kerja atau harga? — {{business_name}}",
    "Salam {{customer_name}}, ini susulan terakhir kami tentang sebut harga {{quote_number}}. Jika rancangan anda telah berubah, balas sahaja mesej ini dan kami akan menghentikan peringatan. Terima kasih! — {{business_name}}",
  ],
  zh: [
    "{{customer_name}}，您好！想跟进一下，您是否已查看关于 {{project}} 的报价单 {{quote_number}}？如有任何疑问，欢迎随时回复。— {{business_name}}",
    "{{customer_name}}，您好！想再跟进一下报价单 {{quote_number}}。关于施工范围或价格，您是否有需要我们进一步说明的地方？— {{business_name}}",
    "{{customer_name}}，您好！这是我们关于报价单 {{quote_number}} 的最后一次跟进。如果您的计划有变，只需回复此邮件，我们就会停止后续提醒。谢谢！— {{business_name}}",
  ],
};

export function applyTemplateLanguage(rules, language) {
  const templates = FOLLOW_UP_TEMPLATES[language];
  if (!templates) throw new Error("Choose a supported template language.");
  if (!rules.length)
    return DEFAULT_RULES.map((rule, i) => ({
      ...rule,
      template: templates[i],
    }));
  return rules.map((rule, i) => ({
    ...rule,
    template: templates[i === 0 ? 0 : i === rules.length - 1 ? 2 : 1],
  }));
}
