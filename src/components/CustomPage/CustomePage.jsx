import React, { Component } from 'react';
import './CustomPage.scss';
import { getPageByName, getPages, getSocialLinks, getWebsiteData } from '../../firestore/dbOperations';
// Images

import { withTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import HomepageNavbar from '../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../Dashboard2/elements/HomepageFooter';
import { sanitizePublicHtml } from '../../utils/sanitizeHtml';

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
        this.setState({ loaded: false, pageState: 'loading', error: '', pageContent: '', currentPage: slug });
        try {
            const [page, pages, website, socialLinks] = await Promise.all([getPageByName(slug), getPages(), getWebsiteData(), getSocialLinks()]);
            if (!this._active || generation !== this._generation) return;
            if (!page) {
                document.title = 'Page not found — ResumePilot AI';
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
                {this.state.loaded && this.state.pageState === 'failed' && <main className="min-h-screen p-12 text-center" role="alert"><h1 className="text-2xl font-bold">Page unavailable</h1><p className="mt-3 text-red-700">{this.state.error}</p></main>}
                {this.state.loaded && this.state.pageState === 'published' && <div id="customPage" className="custom-page"><HomepageNavbar user={this.props.user} /><div dangerouslySetInnerHTML={{ __html: sanitizePublicHtml(this.state.pageContent) }} className="custom-page__content mt-[100px] w-7xl mx-auto"></div><HomepageFooter user={this.props.user} /></div>}
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
