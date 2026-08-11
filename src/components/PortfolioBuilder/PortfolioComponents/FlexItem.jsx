import React from 'react';

const FlexItem = ({ flexGrow = 0, flexShrink = 1, flexBasis = 'auto', alignSelf = 'auto', order = 0, itemContent, puck }) => {
    const ItemContent = itemContent;

    return (
        <div
            ref={puck?.dragRef}
            style={{
                flexGrow,
                flexShrink,
                flexBasis,
                alignSelf,
                order,
                minHeight: '50px',
                minWidth: '50px',
            }}>
            <ItemContent />
        </div>
    );
};

// Flex Item Category Component
const FlexItemCategory = {
    // Enable inline mode to remove wrapper and allow flex properties to work
    inline: true,

    fields: {
        flexGrow: {
            type: 'number',
            label: 'Flex Grow',
            min: 0,
            max: 10,
        },
        flexShrink: {
            type: 'number',
            label: 'Flex Shrink',
            min: 0,
            max: 10,
        },
        flexBasis: {
            type: 'text',
            label: 'Flex Basis',
            placeholder: 'auto, 100px, 50%, etc.',
        },
        alignSelf: {
            type: 'select',
            label: 'Align Self',
            options: [
                { label: 'Auto', value: 'auto' },
                { label: 'Flex Start', value: 'flex-start' },
                { label: 'Flex End', value: 'flex-end' },
                { label: 'Center', value: 'center' },
                { label: 'Baseline', value: 'baseline' },
                { label: 'Stretch', value: 'stretch' },
            ],
        },
        order: {
            type: 'number',
            label: 'Order',
            min: -10,
            max: 10,
        },
        itemContent: {
            type: 'slot',
            label: 'Item Content',
        },
    },
    defaultProps: {
        flexGrow: 0,
        flexShrink: 1,
        flexBasis: 'auto',
        alignSelf: 'auto',
        order: 0,
        itemContent: [],
    },
    render: FlexItem,
};

export default FlexItemCategory;
