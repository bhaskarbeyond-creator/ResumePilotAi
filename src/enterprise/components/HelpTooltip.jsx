import React from 'react';
import { FiHelpCircle } from 'react-icons/fi';

/**
 * Enterprise Help Tooltip Component
 * Renders an accessible, crisp '?' help icon with instant hover tooltip guidance.
 * 
 * @param {Object} props
 * @param {string} props.text - The help guidance description to display
 * @param {'top'|'bottom'|'left'|'right'} [props.position='top'] - Position hint
 * @param {string} [props.className=''] - Additional class names
 * @param {string} [props.label='Help guide'] - Accessible screen reader label
 */
export default function HelpTooltip({ text, position = 'bottom', className = '', label = 'Help guide' }) {
  if (!text) return null;

  return (
    <span
      className={`enterprise-help-container ${className}`}
      data-tooltip={text}
      data-tooltip-pos={position}
      role="note"
      aria-label={`${label}: ${text}`}
      tabIndex={0}
    >
      <FiHelpCircle className="enterprise-help-icon" aria-hidden="true" />
    </span>
  );
}
