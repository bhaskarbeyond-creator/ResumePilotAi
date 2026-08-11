import React from 'react';

const FlexLayout = ({ direction = 'row', wrap = 'wrap', gap = 16, alignItems = 'stretch', justifyContent = 'flex-start', alignContent = 'stretch', flexContent }) => {
    const FlexContent = flexContent;

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: direction,
                flexWrap: wrap,
                gap: `${gap}px`,
                alignItems,
                justifyContent,
                alignContent,
                width: '100%',
                minHeight: '100px',
            }}>
            <FlexContent />
        </div>
    );
};

// Flex Layout Category Component
const FlexLayoutCategory = {
    fields: {
        direction: {
            type: 'select',
            label: 'Direction',
            options: [
                { label: 'Row', value: 'row' },
                { label: 'Row Reverse', value: 'row-reverse' },
                { label: 'Column', value: 'column' },
                { label: 'Column Reverse', value: 'column-reverse' },
            ],
        },
        wrap: {
            type: 'select',
            label: 'Wrap',
            options: [
                { label: 'No Wrap', value: 'nowrap' },
                { label: 'Wrap', value: 'wrap' },
                { label: 'Wrap Reverse', value: 'wrap-reverse' },
            ],
        },
        gap: {
            type: 'number',
            label: 'Gap (px)',
            min: 0,
            max: 100,
        },
        alignItems: {
            type: 'select',
            label: 'Align Items',
            options: [
                { label: 'Stretch', value: 'stretch' },
                { label: 'Flex Start', value: 'flex-start' },
                { label: 'Flex End', value: 'flex-end' },
                { label: 'Center', value: 'center' },
                { label: 'Baseline', value: 'baseline' },
            ],
        },
        justifyContent: {
            type: 'select',
            label: 'Justify Content',
            options: [
                { label: 'Flex Start', value: 'flex-start' },
                { label: 'Flex End', value: 'flex-end' },
                { label: 'Center', value: 'center' },
                { label: 'Space Between', value: 'space-between' },
                { label: 'Space Around', value: 'space-around' },
                { label: 'Space Evenly', value: 'space-evenly' },
            ],
        },
        alignContent: {
            type: 'select',
            label: 'Align Content',
            options: [
                { label: 'Stretch', value: 'stretch' },
                { label: 'Flex Start', value: 'flex-start' },
                { label: 'Flex End', value: 'flex-end' },
                { label: 'Center', value: 'center' },
                { label: 'Space Between', value: 'space-between' },
                { label: 'Space Around', value: 'space-around' },
            ],
        },
        flexContent: {
            type: 'slot',
            label: 'Flex Content',
        },
    },
    defaultProps: {
        direction: 'row',
        wrap: 'wrap',
        gap: 16,
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        alignContent: 'stretch',
        flexContent: [],
    },
    render: FlexLayout,
};

export default FlexLayoutCategory;
