import React from 'react';

const GridItem = ({ columnSpan = 1, rowSpan = 1, alignSelf = 'auto', justifySelf = 'auto', itemContent, puck }) => {
    const ItemContent = itemContent;

    return (
        <div
            ref={puck?.dragRef}
            style={{
                gridColumn: `span ${columnSpan}`,
                gridRow: `span ${rowSpan}`,
                alignSelf,
                justifySelf,
                minHeight: '50px',
            }}>
            <ItemContent />
        </div>
    );
};

// Grid Item Category Component
const GridItemCategory = {
    // Enable inline mode to remove wrapper and allow grid properties to work
    inline: true,

    fields: {
        columnSpan: {
            type: 'number',
            label: 'Column Span',
            min: 1,
            max: 6,
        },
        rowSpan: {
            type: 'number',
            label: 'Row Span',
            min: 1,
            max: 6,
        },
        alignSelf: {
            type: 'select',
            label: 'Vertical Alignment',
            options: [
                { label: 'Auto', value: 'auto' },
                { label: 'Start', value: 'start' },
                { label: 'Center', value: 'center' },
                { label: 'End', value: 'end' },
                { label: 'Stretch', value: 'stretch' },
            ],
        },
        justifySelf: {
            type: 'select',
            label: 'Horizontal Alignment',
            options: [
                { label: 'Auto', value: 'auto' },
                { label: 'Start', value: 'start' },
                { label: 'Center', value: 'center' },
                { label: 'End', value: 'end' },
                { label: 'Stretch', value: 'stretch' },
            ],
        },
        itemContent: {
            type: 'slot',
            label: 'Item Content',
        },
    },
    defaultProps: {
        columnSpan: 1,
        rowSpan: 1,
        alignSelf: 'auto',
        justifySelf: 'auto',
        itemContent: [],
    },
    render: GridItem,
};

export default GridItemCategory;
