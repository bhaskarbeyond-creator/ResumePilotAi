import React, { Component } from 'react';
import './CustomPage.scss';
import { getPageByName, getPages, getSocialLinks, getWebsiteData } from '../../services/api/platform';
// Images

import { withTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import HomepageNavbar from '../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../Dashboard2/elements/HomepageFooter';
import { sanitizePublicHtml } from '../../utils/sanitizeHtml';

const DEFAULT_LEGAL_PAGES = {
    'privacy-policy': {
        title: 'Privacy Policy — IME365',
        description: 'Comprehensive Privacy Policy detailing data protection, encryption, and GDPR compliance on IME365.',
        pagecontent: `
            <div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;">
                <div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;">
                    <span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">Legal & Privacy</span>
                    <h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Privacy Policy</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Last Updated: September 2026 • Certified GDPR & CCPA Compliant</p>
                </div>
                
                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">1. Information We Collect</h2>
                    <p>IME365 collects account credentials, career experience data, education, skills, and job target details provided directly when crafting resumes, portfolios, and practicing interview simulations.</p>
                </section>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">2. AI Processing & Zero Training Pledge</h2>
                    <p>Your resume data, job descriptions, and mock interview transcripts processed through secure enterprise AI generation services are strictly ephemeral. We enforce a strict zero-retention pledge: your private career data is never used to train public foundation models.</p>
                </section>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">3. Data Security & Encryption</h2>
                    <p>All stored records in MariaDB and session tokens are encrypted in transit via TLS 1.3 and protected with AES-256-GCM encryption at rest. Multi-factor authentication (TOTP) is enforced for sensitive operations.</p>
                </section>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">4. Your Rights (GDPR / CCPA)</h2>
                    <p>You maintain full ownership of your data. You may export your complete resume ledger in JSON/PDF/DOCX format or permanently erase your account and associated documents from your Account Settings at any time.</p>
                </section>
            </div>
        `
    },
    'terms-of-service': {
        title: 'Terms of Service — IME365',
        description: 'Terms of Service and acceptable use policy for IME365 platform.',
        pagecontent: `
            <div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;">
                <div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;">
                    <span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">Terms of Agreement</span>
                    <h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Terms of Service</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Effective Date: September 2026</p>
                </div>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">1. Acceptance of Terms</h2>
                    <p>By accessing IME365, you agree to these Terms of Service, all applicable laws, and regulations. If you do not agree with any of these terms, you are prohibited from using the service.</p>
                </section>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">2. User Accounts & Subscriptions</h2>
                    <p>Free accounts receive access to foundational ATS resume templates and standard AI tailoring. Pro Subscriptions unlock full access to all 51 certified templates, unlimited AI interview coaching, and native DOCX exports.</p>
                </section>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">3. Intellectual Property</h2>
                    <p>You retain 100% intellectual property ownership of all resumes, cover letters, and portfolio content created using IME365.</p>
                </section>
            </div>
        `
    },
    'cookie-policy': {
        title: 'Cookie Policy — IME365',
        description: 'Cookie Policy and local storage usage on IME365.',
        pagecontent: `
            <div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;">
                <div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;">
                    <span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">Cookie Compliance</span>
                    <h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Cookie Policy</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Last Updated: September 2026</p>
                </div>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">1. Essential Cookies</h2>
                    <p>We use essential cookies strictly required to authenticate sessions, maintain secure CSRF protection, and persist your draft builder steps.</p>
                </section>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">2. Managing Your Preferences</h2>
                    <p>You can manage your cookie consent preferences at any time via the Privacy Consent banner or within your browser settings.</p>
                </section>
            </div>
        `
    },
    'about-us': {
        title: 'About Us — IME365',
        description: 'About IME365: Next-generation career platform empowering professionals with AI-driven resumes, portfolios, and interview practice.',
        pagecontent: `
            <div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;">
                <div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;">
                    <span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">About IME365</span>
                    <h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Empowering Career Excellence</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Built for modern job seekers, engineers, leaders, and career changers.</p>
                </div>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Our Mission</h2>
                    <p>IME365 combines state-of-the-art LLM intelligence, recruiter-certified typography, and real-time ATS scoring to ensure your talent gets recognized by top employers worldwide.</p>
                </section>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Platform Architecture</h2>
                    <p>With 51 ATS-optimized template layouts, high-fidelity PDF and DOCX exports, interactive web portfolio hosting, and CBT behavioral interview simulation, we deliver a full-lifecycle career acceleration suite.</p>
                </section>
            </div>
        `
    },
    'about': {
        title: 'About Us — IME365',
        description: 'About IME365: Next-generation career platform empowering professionals with AI-driven resumes, portfolios, and interview practice.',
        pagecontent: `
            <div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 40px 20px;">
                <div style="margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px;">
                    <span style="font-size: 13px; font-weight: 800; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.06em;">About IME365</span>
                    <h1 style="font-size: 36px; font-weight: 800; color: #0f172a; margin: 8px 0 12px 0;">Empowering Career Excellence</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Built for modern job seekers, engineers, leaders, and career changers.</p>
                </div>

                <section style="margin-bottom: 32px;">
                    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">Our Mission</h2>
                    <p>IME365 combines state-of-the-art LLM intelligence, recruiter-certified typography, and real-time ATS scoring to ensure your talent gets recognized by top employers worldwide.</p>
                </section>
            </div>
        `
    }
};

class CustomePage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pages: [],
            websiteName: '',
            websiteDescription: '',
            pageContent: '',
            socialLinks: null,
            loaded: false, pageState: 'loading', error: '',
            currentPage: this.props.custompage,
        };

        // Inisialising proper  style for custom pages
        window.location.pathname.substring(0, 3) == '/p/' && this.customStyles();
    }

    componentDidMount() {
        this._active = true; this._generation = 0;
        this.loadPage(this.props.custompage);
    }
    componentDidUpdate(previousProps) { if (previousProps.custompage !== this.props.custompage) this.loadPage(this.props.custompage); }
    componentWillUnmount() { this._active = false; this._generation += 1; }
    async loadPage(slug) {
        const generation = ++this._generation;
        const normalizedSlug = String(slug || '').toLowerCase().trim();
        this.setState({ loaded: false, pageState: 'loading', error: '', pageContent: '', currentPage: normalizedSlug });
        try {
            const [fetchedPage, pages, website, socialLinks] = await Promise.all([
                getPageByName(normalizedSlug).catch(() => null),
                getPages().catch(() => []),
                getWebsiteData().catch(() => null),
                getSocialLinks().catch(() => null)
            ]);
            if (!this._active || generation !== this._generation) return;
            
            const page = fetchedPage || DEFAULT_LEGAL_PAGES[normalizedSlug] || null;

            if (!page) {
                document.title = 'Page not found — IME365';
                document.head.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex,nofollow');
                this.setState({ loaded: true, pageState: 'not-found', pages: pages || [], websiteName: website?.title || '', socialLinks });
                return;
            }
            const canonical = `${window.location.origin}/p/${encodeURIComponent(slug)}`;
            document.title = page.title || slug;
            const setMeta = (selector, attribute, value) => document.head.querySelector(selector)?.setAttribute(attribute, value);
            setMeta('meta[name="description"]', 'content', page.description || website?.description || '');
            setMeta('meta[name="robots"]', 'content', 'index,follow');
            setMeta('meta[property="og:title"]', 'content', page.title || slug);
            setMeta('meta[property="og:description"]', 'content', page.description || website?.description || '');
            setMeta('meta[property="og:url"]', 'content', canonical);
            setMeta('link[rel="canonical"]', 'href', canonical);
            this.setState({ loaded: true, pageState: 'published', pageContent: page.pagecontent || '', pages: pages || [], websiteName: website?.title || '', websiteDescription: website?.description || '', socialLinks });
        } catch (error) {
            if (this._active && generation === this._generation) this.setState({ loaded: true, pageState: 'failed', error: error.message || 'Page could not be loaded.' });
        }
    }

    // Giving the proper stylicn for custom pages
    customStyles() {
        document.getElementById('root').style.overflow = 'none';
        document.getElementById('root').style.height = 'unset';
        document.getElementsByTagName('body')[0].style.height = 'fit-content';
        document.getElementsByTagName('body')[0].style.overflow = 'unset';
        document.getElementsByTagName('html')[0].style.height = 'fit-content';
        document.getElementsByTagName('html')[0].style.overflow = 'scroll';
        document.getElementsByTagName('html')[0].style.overflowX = 'hidden';
    }

    render() {
        return (
            <>
                {!this.state.loaded && <main className="min-h-screen p-12 text-center" role="status">Loading page…</main>}
                {this.state.loaded && this.state.pageState === 'not-found' && <main className="min-h-screen p-12 text-center"><h1 className="text-2xl font-bold">Page not found</h1><p className="mt-3 text-slate-600">This client-side route is unavailable or not published. The deployment edge may still return HTTP 200 for this SPA route.</p></main>}
                {this.state.loaded && this.state.pageState === 'published' && (
                    <div id="customPage" className="custom-page rp-public-site" style={{ background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                        <HomepageNavbar />
                        <div style={{ flex: '1 0 auto', paddingTop: '100px', paddingBottom: '60px' }}>
                            <div dangerouslySetInnerHTML={{ __html: sanitizePublicHtml(this.state.pageContent) }} className="custom-page__content" style={{ background: '#ffffff', maxWidth: '900px', margin: '0 auto', borderRadius: '24px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }} />
                        </div>
                        <HomepageFooter />
                    </div>
                )}
            </>
        );
    }
}

// Wrapper component to use useParams hook and pass parameters as props
const CustomePageWrapper = (props) => {
    const { custompage } = useParams();
    return <CustomePage {...props} custompage={custompage} />;
};

const MyComponent = withTranslation('common')(CustomePageWrapper);
export default MyComponent;
