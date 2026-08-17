import React from 'react';

export default function SmartHeader({ values = {}, theme = {}, variant = 'standard' }) {
  const firstname = values.firstname || values.firstName || '';
  const lastname = values.lastname || values.lastName || '';
  const occupation = values.occupation || values.jobTitle || values.title || '';
  const phone = values.phone || values.phoneNumber || '';
  const email = values.email || values.userEmail || '';
  const address = values.address || '';
  const city = values.city || '';
  const country = values.country || '';
  const postalcode = values.postalcode || values.postalCode || values.zipCode || '';
  const website = values.website || values.websiteUrl || '';
  const linkedin = values.linkedin || values.linkedinUrl || '';
  const github = values.github || values.githubUrl || '';
  const rawPhoto = values.photo || values.selectedImage || values.image || values.avatar || values.picture || null;
  const isPhotoVisible = Boolean(rawPhoto && values.showPhoto !== false && values.hidePhoto !== true && values.includePhoto !== false);

  const fullName = [firstname, lastname].filter(Boolean).join(' ') || values.name || 'Your Name';
  const cityZip = [city, postalcode].filter(Boolean).join(' ');
  const location = [address, cityZip, country].filter(Boolean).join(', ');

  const isBanner = variant === 'banner';
  const isMinimal = variant === 'minimal';

  return (
    <header className={`smart-header smart-header--${variant}`} style={{ '--primary': theme.primary, '--secondary': theme.secondary }}>
      <div className="smart-header__main">
        {isPhotoVisible && (
          <div className="smart-header__avatar-wrap">
            <img src={rawPhoto} alt={fullName} className="smart-header__avatar" loading="eager" decoding="sync" crossOrigin="anonymous" />
          </div>
        )}
        <div className="smart-header__titles">
          <h1 className="smart-header__name">
            <span className="smart-header__first">{firstname} </span>
            <span className="smart-header__last">{lastname}</span>
          </h1>
          {occupation && <h2 className="smart-header__role">{occupation}</h2>}
        </div>
      </div>

      <div className="smart-header__contacts">
        {phone && (
          <div className="smart-contact-item">
            <svg className="smart-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span>{phone}</span>
          </div>
        )}
        {email && (
          <div className="smart-contact-item">
            <svg className="smart-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <span>{email}</span>
          </div>
        )}
        {location && (
          <div className="smart-contact-item">
            <svg className="smart-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>{location}</span>
          </div>
        )}
        {website && (
          <div className="smart-contact-item">
            <svg className="smart-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>{website.replace(/^https?:\/\//, '')}</span>
          </div>
        )}
        {linkedin && (
          <div className="smart-contact-item">
            <svg className="smart-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            <span>{linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')}</span>
          </div>
        )}
        {github && (
          <div className="smart-contact-item">
            <svg className="smart-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
            <span>{github.replace(/^https?:\/\/(www\.)?github\.com\//, '')}</span>
          </div>
        )}
      </div>
    </header>
  );
}
