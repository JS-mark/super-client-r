import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Auto-import all json files from locales directory
const modules = import.meta.glob('./locales/*/*.json', { eager: true });

const resources: Record<string, any> = {};

for (const path in modules) {
  // path is like "./locales/en/common.json"
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (match) {
    const [, lang, namespace] = match;
    if (!resources[lang]) {
      resources[lang] = {};
    }
    resources[lang][namespace] = (modules[path] as any).default;
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh',
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    ns: Object.keys(resources['zh'] || {}), // Load namespaces from zh
    defaultNS: 'common',
  });

export default i18n;
