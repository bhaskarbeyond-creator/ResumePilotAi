import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import common_es from './locales/es/es.json';
import common_en from './locales/en/en.json';
import common_fr from './locales/fr/fr.json';
import common_ru from './locales/ru/ru.json';
import common_se from './locales/se/se.json';
import common_dk from './locales/dk/dk.json';
import common_pt from './locales/pt/pt.json';
import common_de from './locales/de/de.json';
import common_it from './locales/it/it.json';
import common_gk from './locales/gk/gk.json';
import common_is from './locales/is/is.json';
import common_no from './locales/no/no.json';
import common_pl from './locales/pl/pl.json';
import common_ro from './locales/ro/ro.json';
import common_hi from './locales/hi/hi.json';
import common_nl from './locales/nl/nl.json';

import Backend from 'i18next-http-backend';

// Get saved language from localStorage
const savedLanguage = localStorage.getItem('preferredLanguage');

i18n
   .use(Backend)
   .use(initReactI18next)
   .init({
      lng: savedLanguage || 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: ['common'],
      debug: false,
      interpolation: {
         escapeValue: false, // not needed for react as it escapes by default
      },
      resources: {
         en: {
            common: common_en, // 'common' is our custom namespace
         },
         hi: {
            common: common_hi,
         },
         es: {
            common: common_es,
         },
         fr: {
            common: common_fr,
         },
         ru: {
            common: common_ru,
         },
         se: {
            common: common_se,
         },
         dk: {
            common: common_dk,
         },
         pt: {
            common: common_pt,
         },
         de: {
            common: common_de,
         },
         it: {
            common: common_it,
         },
         gk: {
            common: common_gk,
         },
         is: {
            common: common_is,
         },
         no: {
            common: common_no,
         },
         pl:{
            common: common_pl,
         },
         ro:{
            common: common_ro,
         },
         nl:{
            common: common_nl,
         }
      },
   });

export default i18n;
