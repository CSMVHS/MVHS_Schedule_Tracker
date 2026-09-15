/* Custom Color Picker Swatch Palette Enhancements */
(function() {
    const PRESET_COLORS = [
        { name: 'Dark Green', hex: '#00401e' },
        { name: 'Gold', hex: '#b1953a' },
        { name: 'Emerald', hex: '#10b981' },
        { name: 'Yellow', hex: '#eab308' },
        { name: 'Red', hex: '#ef4444' },
        { name: 'Blue', hex: '#3b82f6' },
        { name: 'Purple', hex: '#8b5cf6' },
        { name: 'Pink', hex: '#ec4899' },
        { name: 'Orange', hex: '#f97316' },
        { name: 'White', hex: '#ffffff' },
        { name: 'Black', hex: '#000000' }
    ];

    function setupColorPalette(colorInput) {
        if (!colorInput || colorInput.dataset.paletteInitialized) return;
        colorInput.dataset.paletteInitialized = "true";

        // Create container for swatches
        const container = document.createElement('div');
        container.className = 'preset-color-palette';

        PRESET_COLORS.forEach(color => {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'preset-swatch';
            swatch.style.backgroundColor = color.hex;
            swatch.title = `${color.name} (${color.hex})`;

            if (colorInput.value.toLowerCase() === color.hex.toLowerCase()) {
                swatch.classList.add('active');
            }

            swatch.addEventListener('click', (e) => {
                e.preventDefault();
                colorInput.value = color.hex;
                colorInput.dispatchEvent(new Event('input', { bubbles: true }));
                colorInput.dispatchEvent(new Event('change', { bubbles: true }));
                updateActiveSwatch();
            });

            container.appendChild(swatch);
        });

        const updateActiveSwatch = () => {
            const val = colorInput.value.toLowerCase();
            container.querySelectorAll('.preset-swatch').forEach(sw => {
                const bgHex = rgbToHex(sw.style.backgroundColor);
                if (bgHex.toLowerCase() === val) {
                    sw.classList.add('active');
                } else {
                    sw.classList.remove('active');
                }
            });
        };

        colorInput._updateCustomColor = updateActiveSwatch;
        colorInput.addEventListener('input', updateActiveSwatch);
        colorInput.addEventListener('change', updateActiveSwatch);

        // Replace default input element visually or append palette
        colorInput.style.display = 'none'; // hide raw native color picker
        colorInput.parentNode.insertBefore(container, colorInput.nextSibling);
    }

    function rgbToHex(rgb) {
        if (rgb.startsWith('#')) return rgb;
        const rgbValues = rgb.match(/\d+/g);
        if (!rgbValues || rgbValues.length < 3) return '#000000';
        return '#' + rgbValues.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }

    function enhanceAllCustomUi(root = document) {
        const colorInputs = root.querySelectorAll('input[type="color"]');
        colorInputs.forEach(input => setupColorPalette(input));
    }

    window.enhanceAllCustomUi = enhanceAllCustomUi;

    document.addEventListener('DOMContentLoaded', () => {
        enhanceAllCustomUi();
    });
})();
