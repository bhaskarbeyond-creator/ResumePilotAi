import React from 'react';
import { sanitizePortfolioImageUrl, sanitizePortfolioUrl } from '../PortfolioBuilder/portfolioSanitization.js';
import { normalizePortfolioData, visiblePortfolioSections } from '../../utils/portfolioData.js';

// eslint-disable-next-line react-refresh/only-export-components
export function hasText(value) {
    return Boolean(String(value || '').trim());
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatRange(start, end) {
    const begin = String(start || '').trim();
    const finish = String(end || '').trim();
    if (begin && finish) return `${begin} — ${finish}`;
    return begin || finish || '';
}

// eslint-disable-next-line react-refresh/only-export-components
export function hrefFor(value, kind = 'url') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (kind === 'email' && !raw.startsWith('mailto:')) return sanitizePortfolioUrl(`mailto:${raw}`);
    if (kind === 'phone' && !raw.startsWith('tel:')) return sanitizePortfolioUrl(`tel:${raw.replace(/\s+/g, '')}`);
    const cleaned = sanitizePortfolioUrl(raw.startsWith('http') || raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') ? raw : `https://${raw}`);
    return cleaned === '#' ? '' : cleaned;
}

export function SafeLink({ href, children, className, kind = 'url' }) {
    const safe = hrefFor(href, kind);
    if (!safe) return null;
    const external = safe.startsWith('http');
    return (
        <a href={safe} className={className} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {children}
        </a>
    );
}

export function Portrait({ src, name, className }) {
    const image = sanitizePortfolioImageUrl(src || '');
    if (!image) return null;
    return <img src={image} alt={name ? `Portrait of ${name}` : 'Profile portrait'} className={className} />;
}

export function Section({ id, title, show, children, className, headingClassName, eyebrow }) {
    if (!show) return null;
    return (
        <section id={id} className={className} aria-labelledby={title ? `${id}-title` : undefined}>
            {eyebrow ? <p className="webcv-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 id={`${id}-title`} className={headingClassName}>{title}</h2> : null}
            {children}
        </section>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePortfolioView(canonical, templateKey) {
    const data = normalizePortfolioData(canonical, { template: templateKey });
    const visibility = visiblePortfolioSections(data);
    const name = data.heading.fullName || [data.heading.firstname, data.heading.lastname].filter(Boolean).join(' ');
    const location = [data.heading.city, data.heading.country].filter(Boolean).join(', ');
    return { data, visibility, name, location };
}

export function ContactList({ heading, className, linkClassName, itemClassName }) {
    const items = [
        heading.email ? { key: 'email', href: heading.email, kind: 'email', label: heading.email } : null,
        heading.phone ? { key: 'phone', href: heading.phone, kind: 'phone', label: heading.phone } : null,
        heading.website ? { key: 'website', href: heading.website, label: 'Website' } : null,
        heading.linkedin ? { key: 'linkedin', href: heading.linkedin, label: 'LinkedIn' } : null,
        heading.github ? { key: 'github', href: heading.github, label: 'GitHub' } : null,
    ].filter(Boolean);
    if (!items.length) return null;
    return (
        <ul className={className}>
            {items.map((item) => (
                <li key={item.key} className={itemClassName}>
                    <SafeLink href={item.href} kind={item.kind} className={linkClassName}>{item.label}</SafeLink>
                </li>
            ))}
        </ul>
    );
}

export function NavLinks({ visibility, className, linkClassName }) {
    const links = [
        visibility.about && { href: '#about', label: 'About' },
        visibility.experience && { href: '#experience', label: 'Experience' },
        visibility.projects && { href: '#projects', label: 'Projects' },
        visibility.skills && { href: '#skills', label: 'Skills' },
        visibility.education && { href: '#education', label: 'Education' },
        visibility.contact && { href: '#contact', label: 'Contact' },
    ].filter(Boolean);
    if (!links.length) return null;
    return (
        <nav className={className} aria-label="Portfolio">
            {links.map((link) => (
                <a key={link.href} href={link.href} className={linkClassName}>{link.label}</a>
            ))}
        </nav>
    );
}

export function SkipLink() {
    return (
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900">
            Skip to content
        </a>
    );
}

export function EmptyWebCv({ message = 'This Web CV is ready to be written. Add your details to publish a public page.' }) {
    return (
        <main id="main" className="min-h-screen flex items-center justify-center px-6 bg-stone-50 text-stone-700">
            <div className="max-w-lg text-center">
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Your Web CV</h1>
                <p className="mt-3 text-sm leading-6">{message}</p>
            </div>
        </main>
    );
}
