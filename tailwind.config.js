/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,jsx,ts,tsx}',
        '!./src/cv-templates/**/*.{js,jsx,ts,tsx}',
        // '!./src/components/**/*.{js,jsx,ts,tsx}'
    ],
    theme: {
        extend: {
            fontFamily: {
                poppins: ['Poppins', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
                sans: ['Poppins', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
            },
            colors: {
                primary: '#4a6cf7', // Blue
                secondary: '#6c7ee1', // Lighter blue
                success: '#34c759', // Green
                warning: '#ff9500', // Orange
                danger: '#ff3b30', // Red
                dark: '#333333', // Dark text
                medium: '#666666', // Medium text
                light: '#999999', // Light text
            },
        },
    },
    plugins: [],
};
