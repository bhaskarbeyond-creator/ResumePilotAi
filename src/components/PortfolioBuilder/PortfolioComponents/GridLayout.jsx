import React from 'react';

const GridLayout = ({ columns = 2, gap = 16, gridContent, minColumnWidth = '250px', alignItems = 'start', justifyContent = 'start' }) => {
    const GridContent = gridContent;

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(${minColumnWidth}, 1fr))`,
                gap: `${gap}px`,
                alignItems,
                justifyContent,
                width: '100%',
            }}>
            <GridContent />
        </div>
    );
};

// Grid Layout Category Component
const GridLayoutCategory = {
    fields: {
        columns: {
            type: 'number',
            label: 'Number of Columns',
            min: 1,
            max: 6,
        },
        gap: {
            type: 'number',
            label: 'Gap (px)',
            min: 0,
            max: 100,
        },
        minColumnWidth: {
            type: 'text',
            label: 'Min Column Width',
            placeholder: '250px',
        },
        alignItems: {
            type: 'select',
            label: 'Vertical Alignment',
            options: [
                { label: 'Start', value: 'start' },
                { label: 'Center', value: 'center' },
                { label: 'End', value: 'end' },
                { label: 'Stretch', value: 'stretch' },
            ],
        },
        justifyContent: {
            type: 'select',
            label: 'Horizontal Alignment',
            options: [
                { label: 'Start', value: 'start' },
                { label: 'Center', value: 'center' },
                { label: 'End', value: 'end' },
                { label: 'Space Between', value: 'space-between' },
                { label: 'Space Around', value: 'space-around' },
                { label: 'Space Evenly', value: 'space-evenly' },
            ],
        },
        gridContent: {
            type: 'slot',
            label: 'Grid Content',
        },
    },
    defaultProps: {
        columns: 2,
        gap: 16,
        minColumnWidth: '250px',
        alignItems: 'start',
        justifyContent: 'start',
        gridContent: [],
    },
    render: GridLayout,
};

export default GridLayoutCategory;
