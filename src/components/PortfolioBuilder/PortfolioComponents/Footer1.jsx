import React from 'react';

const Footer1 = {
    fields: {
        companyName: { type: 'text', label: 'Company/Name' },
        description: { type: 'textarea', label: 'Description' },
        email: { type: 'text', label: 'Email' },
        phone: { type: 'text', label: 'Phone' },
        address: { type: 'textarea', label: 'Address' },
        socialLinks: { type: 'textarea', label: 'Social Links (format: Platform|URL, one per line)' },
        quickLinks: { type: 'textarea', label: 'Quick Links (one per line)' },
        backgroundColor: {
            type: 'select',
            label: 'Background Color',
            options: [
                { value: 'bg-gray-800', label: 'Dark Gray' },
                { value: 'bg-gray-900', label: 'Darker Gray' },
                { value: 'bg-black', label: 'Black' },
                { value: 'bg-blue-800', label: 'Dark Blue' },
                { value: 'bg-purple-800', label: 'Dark Purple' },
            ],
        },
        textColor: {
            type: 'select',
            label: 'Text Color',
            options: [
                { value: 'text-white', label: 'White' },
                { value: 'text-gray-300', label: 'Light Gray' },
                { value: 'text-blue-200', label: 'Light Blue' },
            ],
        },
    },
    defaultProps: {
        companyName: 'Portfolio',
        description: 'Building amazing digital experiences with passion and creativity.',
        email: 'contact@portfolio.com',
        phone: '+1 (555) 123-4567',
        address: '123 Main Street\nNew York, NY 10001',
        socialLinks: 'LinkedIn|https://linkedin.com\nGitHub|https://github.com\nTwitter|https://twitter.com',
        quickLinks: 'About\nServices\nProjects\nContact',
        backgroundColor: 'bg-gray-800',
        textColor: 'text-white',
    },
    render: ({ companyName, description, email, phone, address, socialLinks, quickLinks, backgroundColor, textColor }) => {
        const socialList = socialLinks
            ? Array.isArray(socialLinks)
                ? socialLinks // Already an array of objects
                : socialLinks
                      .split('\n')
                      .filter((item) => item.trim())
                      .map((item) => {
                          const [platform, url] = item.split('|');
                          return { platform: platform?.trim(), url: url?.trim() };
                      })
            : [];

        const linksList = quickLinks.split('\n').filter((item) => item.trim());

        return (
            <footer className={`${backgroundColor} ${textColor} py-12`}>
                <div className="max-w-6xl mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        {/* Company Info */}
                        <div className="md:col-span-2">
                            <h3 className="text-2xl font-bold mb-4">{companyName}</h3>
                            <p className="text-gray-300 mb-6 leading-relaxed">{description}</p>
                            <div className="flex space-x-4">
                                {socialList.map((social, index) => (
                                    <a key={index} href={social.url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors duration-200">
                                        {social.platform}
                                    </a>
                                ))}
                            </div>
                        </div>

                        {/* Quick Links */}
                        <div>
                            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
                            <ul className="space-y-2">
                                {linksList.map((link, index) => (
                                    <li key={index}>
                                        <a href={`#${link.toLowerCase()}`} className="text-gray-300 hover:text-white transition-colors duration-200">
                                            {link}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Contact Info */}
                        <div>
                            <h4 className="text-lg font-semibold mb-4">Contact</h4>
                            <div className="space-y-2 text-gray-300">
                                <p>{email}</p>
                                <p>{phone}</p>
                                <p className="whitespace-pre-line">{address}</p>
                            </div>
                        </div>
                    </div>

                    {/* Copyright */}
                    <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
                        <p>
                            &copy; {new Date().getFullYear()} {companyName}. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        );
    },
};

export default Footer1;
