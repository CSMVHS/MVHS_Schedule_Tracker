/* Custom Color Picker Swatch Palette & Canvas Component */
(function() {
    const DEFAULT_PRESETS = [
        { name: 'Default Green', hex: '#00401e' },
        { name: 'Default Yellow', hex: '#b1953a' }
    ];

    // Helper functions for HSV / RGB / HEX conversion
    function hexToRgb(hex) {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const num = parseInt(hex, 16);
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    function rgbToHex(r, g, b) {
        return "#" + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s: s, v: v };
    }

    function hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor((h / 60) % 6);
        const f = (h / 60) - Math.floor(h / 60);
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return { r: r * 255, g: g * 255, b: b * 255 };
    }

    function setupColorPicker(colorInput) {
        if (!colorInput || colorInput.dataset.pickerInitialized) return;
        colorInput.dataset.pickerInitialized = "true";

        colorInput.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'color-picker-container';

        const paletteContainer = document.createElement('div');
        paletteContainer.className = 'preset-color-palette';

        // Add Default Green and Default Yellow swatches
        DEFAULT_PRESETS.forEach(preset => {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'preset-swatch';
            swatch.style.backgroundColor = preset.hex;
            swatch.title = preset.name;

            swatch.addEventListener('click', (e) => {
                e.preventDefault();
                colorInput.value = preset.hex;
                colorInput.dispatchEvent(new Event('input', { bubbles: true }));
                colorInput.dispatchEvent(new Event('change', { bubbles: true }));
                updateActiveState();
            });

            paletteContainer.appendChild(swatch);
        });

        // Add Art Palette Trigger Button
        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.className = 'palette-trigger-btn';
        triggerBtn.title = 'Open Custom Color Canvas';
        triggerBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M12 3a9 9 0 0 0-9 9c0 4.97 4.03 9 9 9 1.15 0 2.24-.22 3.24-.62.4-.16.64-.58.55-1-.1-.47-.53-.88-1.02-.88h-1.27a2.5 2.5 0 0 1-2.5-2.5v-.29c0-.41.17-.8.47-1.08l1.45-1.38c.67-.64.67-1.72 0-2.36C13.23 10.23 12.37 10 11.5 10H11a1 1 0 0 1 0-2h.5c1.83 0 3.5.76 4.71 1.97A6.63 6.63 0 0 1 18 14.5c0 .28.22.5.5.5s.5-.22.5-.5c0-4.97-4.03-9-9-9zm-5.5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
            </svg>
        `;

        wrapper.appendChild(paletteContainer);
        wrapper.appendChild(triggerBtn);

        colorInput.parentNode.insertBefore(wrapper, colorInput.nextSibling);

        // Popover 2D Color Picker Canvas Setup
        let popover = null;
        let hsv = { h: 120, s: 1, v: 0.5 };

        const updateActiveState = () => {
            const val = colorInput.value.toLowerCase();
            paletteContainer.querySelectorAll('.preset-swatch').forEach(sw => {
                const bg = sw.style.backgroundColor;
                const rgb = hexToRgb(val);
                const swatchHex = rgbToHex(rgb.r, rgb.g, rgb.b).toLowerCase();
                if (swatchHex === val) {
                    sw.classList.add('active');
                } else {
                    sw.classList.remove('active');
                }
            });
        };

        colorInput._updateCustomColor = updateActiveState;
        colorInput.addEventListener('input', updateActiveState);
        colorInput.addEventListener('change', updateActiveState);
        updateActiveState();

        const togglePopover = () => {
            if (popover) {
                closePopover();
                return;
            }

            const rgb = hexToRgb(colorInput.value || "#00401e");
            hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

            popover = document.createElement('div');
            popover.className = 'custom-picker-popover';

            popover.innerHTML = `
                <div class="sat-val-canvas-wrapper">
                    <canvas class="sat-val-canvas"></canvas>
                    <div class="sat-val-handle"></div>
                </div>
                <div class="hue-slider-wrapper">
                    <input type="range" class="hue-slider" min="0" max="360" value="${hsv.h}">
                </div>
                <div class="picker-hex-row">
                    <input type="text" class="picker-hex-input" value="${colorInput.value}">
                </div>
            `;

            wrapper.appendChild(popover);

            const canvas = popover.querySelector('.sat-val-canvas');
            const ctx = canvas.getContext('2d');
            const handle = popover.querySelector('.sat-val-handle');
            const hueSlider = popover.querySelector('.hue-slider');
            const hexInput = popover.querySelector('.picker-hex-input');

            canvas.width = 196;
            canvas.height = 140;

            const renderSatValCanvas = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Base Hue
                const pureRgb = hsvToRgb(hsv.h, 1, 1);
                ctx.fillStyle = `rgb(${pureRgb.r}, ${pureRgb.g}, ${pureRgb.b})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Saturation gradient (white -> transparent)
                const satGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
                satGrad.addColorStop(0, '#ffffff');
                satGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = satGrad;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Value gradient (transparent -> black)
                const valGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                valGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
                valGrad.addColorStop(1, '#000000');
                ctx.fillStyle = valGrad;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Update handle position
                handle.style.left = `${hsv.s * canvas.width}px`;
                handle.style.top = `${(1 - hsv.v) * canvas.height}px`;
            };

            const applyHsvChange = () => {
                renderSatValCanvas();
                const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
                const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
                hexInput.value = hex;
                colorInput.value = hex;
                colorInput.dispatchEvent(new Event('input', { bubbles: true }));
                colorInput.dispatchEvent(new Event('change', { bubbles: true }));
            };

            let isDragging = false;
            const handleSatValMove = (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                hsv.s = x / rect.width;
                hsv.v = 1 - (y / rect.height);
                applyHsvChange();
            };

            canvas.addEventListener('pointerdown', (e) => {
                isDragging = true;
                canvas.setPointerCapture(e.pointerId);
                handleSatValMove(e);
            });

            canvas.addEventListener('pointermove', (e) => {
                if (isDragging) handleSatValMove(e);
            });

            canvas.addEventListener('pointerup', (e) => {
                isDragging = false;
            });

            hueSlider.addEventListener('input', () => {
                hsv.h = parseFloat(hueSlider.value);
                applyHsvChange();
            });

            hexInput.addEventListener('change', () => {
                let val = hexInput.value.trim();
                if (!val.startsWith('#')) val = '#' + val;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                    const rgb = hexToRgb(val);
                    hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                    hueSlider.value = hsv.h;
                    applyHsvChange();
                }
            });

            renderSatValCanvas();
        };

        const closePopover = () => {
            if (popover) {
                popover.remove();
                popover = null;
            }
        };

        triggerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            togglePopover();
        });

        document.addEventListener('click', (e) => {
            if (popover && !wrapper.contains(e.target)) {
                closePopover();
            }
        });
    }

    function enhanceAllCustomUi(root = document) {
        const colorInputs = root.querySelectorAll('input[type="color"]');
        colorInputs.forEach(input => setupColorPicker(input));
    }

    window.enhanceAllCustomUi = enhanceAllCustomUi;

    document.addEventListener('DOMContentLoaded', () => {
        enhanceAllCustomUi();
    });
})();
