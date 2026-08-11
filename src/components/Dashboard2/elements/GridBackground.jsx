import React, { useEffect, useState } from 'react';

const GridBackground = ({ className }) => {
  // Create a pre-rendered grid pattern as a data URL
  // This helps avoid rendering artifacts during animations
  const [gridDataUrl, setGridDataUrl] = useState('');

  useEffect(() => {
    // Create an offscreen canvas to generate our grid pattern
    const canvas = document.createElement('canvas');
    const size = 100; // Size of our pattern tile
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Fill background
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, size, size);

      // Draw grid lines - thinner lines for smaller grid
      ctx.strokeStyle = 'rgba(74, 108, 247, 0.10)';
      ctx.lineWidth = 0.5;

      // Draw vertical grid lines
      ctx.beginPath();
      const gridSize = 10; // Smaller grid squares (was 50)
      for (let x = 0; x <= size; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
      }

      // Draw horizontal grid lines
      for (let y = 0; y <= size; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
      }
      ctx.stroke();

      // Convert to data URL
      setGridDataUrl(canvas.toDataURL('image/png'));
    }
  }, []);

  // Style with the pregenerated pattern
  const backgroundStyles = {
    backgroundContainer: {
      position: 'absolute',
      inset: 0,
      zIndex: 0,
      backgroundColor: '#F8FAFC', // Failsafe background color
      backgroundImage: gridDataUrl ? `url(${gridDataUrl})` : 'none',
      backgroundRepeat: 'repeat',
      transform: 'translate3d(0, 0, 0)', // Force GPU acceleration
      willChange: 'transform',
      backfaceVisibility: 'hidden',
      opacity: 1,
      transition: 'opacity 0.1s ease', // Smooth fade-in once loaded
      visibility: gridDataUrl ? 'visible' : 'hidden',
    },
    solidFallback: {
      position: 'absolute',
      inset: 0,
      backgroundColor: '#F8FAFC',
      zIndex: -1,
    }
  };

  return (
    <div className={`fixed inset-0 w-full h-full overflow-hidden pointer-events-none ${className}`}>
      {/* Solid background as fallback/base layer */}
      <div style={backgroundStyles.solidFallback} />
      
      {/* Pre-rendered grid background */}
      <div style={backgroundStyles.backgroundContainer} />
    </div>
  );
};

export default GridBackground;
