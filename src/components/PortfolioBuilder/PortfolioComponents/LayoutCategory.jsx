import React from 'react';

const LayoutTemplate = ({ layoutType = 'twoColumn', gap = 24, padding = 16, leftContent, rightContent, topContent, middleContent, bottomContent, mainContent, sidebarContent }) => {
    const LeftContent = leftContent;
    const RightContent = rightContent;
    const TopContent = topContent;
    const MiddleContent = middleContent;
    const BottomContent = bottomContent;
    const MainContent = mainContent;
    const SidebarContent = sidebarContent;

    const getLayoutStyles = () => {
        const baseStyles = {
            width: '100%',
            padding: `${padding}px`,
            gap: `${gap}px`,
        };

        switch (layoutType) {
            case 'twoColumn':
                return {
                    ...baseStyles,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    minHeight: '300px',
                };
            case 'threeColumn':
                return {
                    ...baseStyles,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    minHeight: '300px',
                };
            case 'sidebar':
                return {
                    ...baseStyles,
                    display: 'grid',
                    gridTemplateColumns: '250px 1fr',
                    minHeight: '400px',
                };
            case 'sidebarRight':
                return {
                    ...baseStyles,
                    display: 'grid',
                    gridTemplateColumns: '1fr 250px',
                    minHeight: '400px',
                };
            case 'headerContentFooter':
                return {
                    ...baseStyles,
                    display: 'grid',
                    gridTemplateRows: 'auto 1fr auto',
                    minHeight: '500px',
                };
            case 'hero':
                return {
                    ...baseStyles,
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr',
                    alignItems: 'center',
                    minHeight: '400px',
                };
            default:
                return baseStyles;
        }
    };

    const renderLayout = () => {
        switch (layoutType) {
            case 'twoColumn':
                return (
                    <>
                        <div style={{ minHeight: '200px' }}>
                            <LeftContent />
                        </div>
                        <div style={{ minHeight: '200px' }}>
                            <RightContent />
                        </div>
                    </>
                );
            case 'threeColumn':
                return (
                    <>
                        <div style={{ minHeight: '200px' }}>
                            <LeftContent />
                        </div>
                        <div style={{ minHeight: '200px' }}>
                            <MiddleContent />
                        </div>
                        <div style={{ minHeight: '200px' }}>
                            <RightContent />
                        </div>
                    </>
                );
            case 'sidebar':
            case 'sidebarRight':
                return (
                    <>
                        <div style={{ minHeight: '300px' }}>
                            <SidebarContent />
                        </div>
                        <div style={{ minHeight: '300px' }}>
                            <MainContent />
                        </div>
                    </>
                );
            case 'headerContentFooter':
                return (
                    <>
                        <div style={{ minHeight: '80px' }}>
                            <TopContent />
                        </div>
                        <div style={{ minHeight: '300px' }}>
                            <MiddleContent />
                        </div>
                        <div style={{ minHeight: '80px' }}>
                            <BottomContent />
                        </div>
                    </>
                );
            case 'hero':
                return (
                    <>
                        <div style={{ minHeight: '300px' }}>
                            <MainContent />
                        </div>
                        <div style={{ minHeight: '300px' }}>
                            <SidebarContent />
                        </div>
                    </>
                );
            default:
                return <MainContent />;
        }
    };

    return <div style={getLayoutStyles()}>{renderLayout()}</div>;
};

// Layout Category Component
const LayoutCategory = {
    fields: {
        layoutType: {
            type: 'select',
            label: 'Layout Template',
            options: [
                { label: 'Two Column', value: 'twoColumn' },
                { label: 'Three Column', value: 'threeColumn' },
                { label: 'Sidebar Left', value: 'sidebar' },
                { label: 'Sidebar Right', value: 'sidebarRight' },
                { label: 'Header/Content/Footer', value: 'headerContentFooter' },
                { label: 'Hero Section', value: 'hero' },
            ],
        },
        gap: {
            type: 'number',
            label: 'Gap (px)',
            min: 0,
            max: 100,
        },
        padding: {
            type: 'number',
            label: 'Padding (px)',
            min: 0,
            max: 100,
        },
        leftContent: {
            type: 'slot',
            label: 'Left Content',
        },
        rightContent: {
            type: 'slot',
            label: 'Right Content',
        },
        topContent: {
            type: 'slot',
            label: 'Top Content',
        },
        middleContent: {
            type: 'slot',
            label: 'Middle Content',
        },
        bottomContent: {
            type: 'slot',
            label: 'Bottom Content',
        },
        mainContent: {
            type: 'slot',
            label: 'Main Content',
        },
        sidebarContent: {
            type: 'slot',
            label: 'Sidebar Content',
        },
    },
    defaultProps: {
        layoutType: 'twoColumn',
        gap: 24,
        padding: 16,
        leftContent: [],
        rightContent: [],
        topContent: [],
        middleContent: [],
        bottomContent: [],
        mainContent: [],
        sidebarContent: [],
    },
    render: LayoutTemplate,
};

export default LayoutCategory;
