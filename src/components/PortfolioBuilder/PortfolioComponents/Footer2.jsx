import React from 'react';

const Footer2 = {
    fields: {
        companyName: { type: 'text', label: 'Company/Name' },
        tagline: { type: 'text', label: 'Tagline' },
        email: { type: 'text', label: 'Email' },
        socialLinks: { type: 'textarea', label: 'Social Links (format: Platform|URL, one per line)' },
        backgroundColor: {
            type: 'select',
            label: 'Background Style',
            options: [
                { value: 'bg-gradient-to-r from-gray-800 to-gray-900', label: 'Dark Gradient' },
                { value: 'bg-gradient-to-r from-blue-800 to-purple-800', label: 'Blue to Purple Gradient' },
                { value: 'bg-gradient-to-r from-purple-800 to-pink-800', label: 'Purple to Pink Gradient' },
                { value: 'bg-black', label: 'Black' },
                { value: 'bg-white', label: 'White' },
            ],
        },
        textColor: {
            type: 'select',
            label: 'Text Color',
            options: [
                { value: 'text-white', label: 'White' },
                { value: 'text-gray-800', label: 'Dark Gray' },
                { value: 'text-gray-300', label: 'Light Gray' },
                { value: 'text-blue-200', label: 'Light Blue' },
            ],
        },
    },
    defaultProps: {
        companyName: 'Portfolio',
        tagline: 'Creating digital experiences that matter',
        email: 'hello@portfolio.com',
        socialLinks: 'LinkedIn|https://linkedin.com\nGitHub|https://github.com\nTwitter|https://twitter.com\nInstagram|https://instagram.com',
        backgroundColor: 'bg-gradient-to-r from-gray-800 to-gray-900',
        textColor: 'text-white',
    },
    render: ({ companyName, tagline, email, socialLinks, backgroundColor, textColor }) => {
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

        return (
            <footer className={`${backgroundColor} ${textColor} py-16`}>
                <div className="max-w-4xl mx-auto px-4 text-center">
                    {/* Main Content */}
                    <div className="mb-8">
                        <h3 className="text-3xl font-bold mb-4">{companyName}</h3>
                        <p className="text-xl text-gray-300 mb-6">{tagline}</p>

                        {/* Social Links */}
                        <div className="flex justify-center space-x-8 mb-8">
                            {socialList.map((social, index) => (
                                <a
                                    key={index}
                                    href={social.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-300 hover:text-white transition-all duration-200 hover:scale-110 text-lg font-medium">
                                    {social.platform}
                                </a>
                            ))}
                        </div>

                        {/* Contact Email */}
                        <div className="mb-8">
                            <a
                                href={`mailto:${email}`}
                                className="inline-block bg-white bg-opacity-10 backdrop-blur-sm px-8 py-3 rounded-full text-white hover:bg-opacity-20 transition-all duration-200 font-medium">
                                Get In Touch - {email}
                            </a>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-gray-600 pt-8">
                        <p className="text-gray-400">
                            &copy; {new Date().getFullYear()} {companyName}. Crafted with ❤️
                        </p>
                    </div>
                </div>
            </footer>
        );
    },
};

export default Footer2;
