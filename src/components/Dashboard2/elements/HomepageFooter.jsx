
import { Link } from "react-router-dom";
import { getPages } from "../../../services/api/platform";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// Import payment icons
import visaLogo from "../../../assets/payment/Visa_Inc._logo.svg";
import mastercardLogo from "../../../assets/payment/Mastercard-logo.svg";
import paypalLogo from "../../../assets/payment/PayPal_logo.svg";
import amexLogo from "../../../assets/payment/American_Express_logo_(2018).svg";
import jcbLogo from "../../../assets/payment/JCB_logo.svg";


const HomepageFooter = () => {
  const { t } = useTranslation('common');
  const [pages, setPages] = useState([]);
  const [_loading, setLoading] = useState(true);

useEffect(() => {
  getPages()
    .then((pages) => {
      setPages(pages || []); // Ensure pages is never null
    })
    .catch((error) => {
      console.warn('Error fetching pages for footer:', error);
      setPages([]); // Set empty array on error
    })
    .finally(() => {
      setLoading(false);
    });
}, []);

  return (
    <footer className="relative bg-gradient-to-br from-[#2a2d35] via-[#252830] to-[#1a1c21] text-gray-300 pt-16 pb-8 mt-12 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden opacity-10">
        <div className="absolute -top-[30%] -right-[10%] w-[600px] h-[600px] rounded-full bg-purple-600/30 blur-[120px]"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute top-[40%] left-[20%] w-[300px] h-[300px] rounded-full bg-indigo-600/20 blur-[80px]"></div>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25px 25px, white 1%, transparent 0%), radial-gradient(circle at 75px 75px, white 1%, transparent 0%)",
            backgroundSize: "100px 100px",
          }}
        ></div>
      </div>
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
          <div className="space-y-6">
            <h4 className="text-lg font-semibold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent pb-1 inline-block border-b border-purple-500/30">
              {t('HomepageFooter.headings.aboutUs')}
            </h4>
            <p className="text-gray-400 leading-relaxed">
              {t('HomepageFooter.aboutText')}
            </p>
          </div>
          <div className="space-y-6">
            <h4 className="text-lg font-semibold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent pb-1 inline-block border-b border-purple-500/30">
              {t('HomepageFooter.headings.quickLinks')}
            </h4>
            <ul className="space-y-3">
        
         
              <li>
                <Link
                  className="text-gray-400 hover:text-purple-300 transition-colors duration-300 flex items-center gap-2 group"
                  to="/pricing"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover:bg-purple-400 group-hover:shadow-glow-sm transition-all duration-300"></span>
                  <span className="relative overflow-hidden group-hover:pl-1 transition-all duration-300">
                    {t('HomepageFooter.links.pricing')}
                    <span className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  className="text-gray-400 hover:text-purple-300 transition-colors duration-300 flex items-center gap-2 group"
                  to="/contact"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover:bg-purple-400 group-hover:shadow-glow-sm transition-all duration-300"></span>
                  <span className="relative overflow-hidden group-hover:pl-1 transition-all duration-300">
                    {t('HomepageFooter.links.contact')}
                    <span className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
                  </span>
                </Link>
              </li>
              {Array.isArray(pages) && pages.length > 0 && pages.map((page) => (
                <li key={page.id}>
                  <Link to={'/p/' + page.id}
                    className="text-gray-400 hover:text-purple-300 transition-colors duration-300 flex items-center gap-2 group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover:bg-purple-400 group-hover:shadow-glow-sm transition-all duration-300"></span>
                    <span className="relative overflow-hidden group-hover:pl-1 transition-all duration-300">
                      {page.id}
                      <span className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-6">
            <h4 className="text-lg font-semibold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent pb-1 inline-block border-b border-purple-500/30">
              {t('navbar.blog')}
            </h4>
            <Link
              to="/blog"
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-glow-sm transition hover:from-purple-500 hover:to-indigo-500"
            >
              {t('navbar.blog')}
            </Link>
          </div>
          <div className="space-y-6">
            <h4 className="text-lg font-semibold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent pb-1 border-b border-purple-500/30 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                ></path>
              </svg>
              {t('HomepageFooter.headings.securePayments')}
            </h4>
            <div className="grid grid-cols-3 gap-3 max-w-[250px]">
              <div className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 p-2.5 rounded-2xl hover:scale-105 transition-all duration-300 backdrop-blur-sm border border-gray-700/30 hover:border-purple-500/30 group shadow-sm hover:shadow-md flex items-center justify-center">
                <img
                  alt={t('HomepageFooter.paymentMethods.visa')}
                  loading="lazy"
                  width="40"
                  height="25"
                  decoding="async"
                  data-nimg="1"
                  className="w-auto h-[20px] mx-auto opacity-80 group-hover:opacity-100 transition-opacity duration-300 object-contain"
                  src={visaLogo}
                  style={{ color: "transparent" }}
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 p-2.5 rounded-2xl hover:scale-105 transition-all duration-300 backdrop-blur-sm border border-gray-700/30 hover:border-purple-500/30 group shadow-sm hover:shadow-md flex items-center justify-center">
                <img
                  alt={t('HomepageFooter.paymentMethods.mastercard')}
                  loading="lazy"
                  width="40"
                  height="25"
                  decoding="async"
                  data-nimg="1"
                  className="w-auto h-[20px] mx-auto opacity-80 group-hover:opacity-100 transition-opacity duration-300 object-contain"
                  src={mastercardLogo}
                  style={{ color: "transparent" }}
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 p-2.5 rounded-2xl hover:scale-105 transition-all duration-300 backdrop-blur-sm border border-gray-700/30 hover:border-purple-500/30 group shadow-sm hover:shadow-md flex items-center justify-center">
                <img
                  alt={t('HomepageFooter.paymentMethods.paypal')}
                  loading="lazy"
                  width="40"
                  height="25"
                  decoding="async"
                  data-nimg="1"
                  className="w-auto h-[20px] mx-auto opacity-80 group-hover:opacity-100 transition-opacity duration-300 object-contain"
                  src={paypalLogo}
                  style={{ color: "transparent" }}
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 p-2.5 rounded-2xl hover:scale-105 transition-all duration-300 backdrop-blur-sm border border-gray-700/30 hover:border-purple-500/30 group shadow-sm hover:shadow-md flex items-center justify-center">
                <img
                  alt={t('HomepageFooter.paymentMethods.amex')}
                  loading="lazy"
                  width="40"
                  height="25"
                  decoding="async"
                  data-nimg="1"
                  className="w-auto h-[20px] mx-auto opacity-80 group-hover:opacity-100 transition-opacity duration-300 object-contain"
                  src={amexLogo}
                  style={{ color: "transparent" }}
                />
              </div>
              <div className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 p-2.5 rounded-2xl hover:scale-105 transition-all duration-300 backdrop-blur-sm border border-gray-700/30 hover:border-purple-500/30 group shadow-sm hover:shadow-md flex items-center justify-center">
                <img
                  alt={t('HomepageFooter.paymentMethods.jcb')}
                  loading="lazy"
                  width="40"
                  height="25"
                  decoding="async"
                  data-nimg="1"
                  className="w-auto h-[20px] mx-auto opacity-80 group-hover:opacity-100 transition-opacity duration-300 object-contain"
                  src={jcbLogo}
                  style={{ color: "transparent" }}
                />
              </div>
            
            </div>
          </div>
        </div>
        <div className="relative mt-16">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-px">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 border border-purple-500/50 bg-[#1f2327]"></div>
          </div>
          <div className="max-w-4xl mx-auto text-center pt-10 space-y-6">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
              <a
                className="text-gray-400 hover:text-purple-300 transition-all duration-300 relative group text-sm"
                href="/p/privacy-policy"
              >
                <span className="relative z-10">{t('HomepageFooter.legal.privacyPolicy')}</span>
                <span className="absolute inset-x-0 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </a>
              <a
                className="text-gray-400 hover:text-purple-300 transition-all duration-300 relative group text-sm"
                href="/p/terms-of-service"
              >
                <span className="relative z-10">{t('HomepageFooter.legal.termsOfService')}</span>
                <span className="absolute inset-x-0 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </a>
              <a
                className="text-gray-400 hover:text-purple-300 transition-all duration-300 relative group text-sm"
                href="/p/cookie-policy"
              >
                <span className="relative z-10">{t('HomepageFooter.legal.cookiePolicy')}</span>
                <span className="absolute inset-x-0 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
              </a>
            </div>
            <div className="relative">
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 animate-pulse"></div>
                <p> {new Date().getFullYear()} ResumePilot AI. {t('HomepageFooter.legal.allRightsReserved')}</p>
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default HomepageFooter;
