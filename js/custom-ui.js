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
            swatch.dataset.hex = preset.hex.toLowerCase();
            swatch.innerHTML = `
                <svg class="swatch-check" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;

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
            <svg viewBox="0 0 24 24" class="palette-icon">
                <path d="M12 3c-4.97 0-9 4.03-9 9 0 4.97 4.03 9 9 9 .83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4c-.83 0-1.5-.67-1.5-1.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
        `;

        paletteContainer.appendChild(triggerBtn);
        wrapper.appendChild(paletteContainer);

        colorInput.parentNode.insertBefore(wrapper, colorInput.nextSibling);

        // Popover 2D Color Picker Canvas Setup
        let popover = null;
        let hsv = { h: 120, s: 1, v: 0.5 };

        const updateActiveState = () => {
            const rawVal = (colorInput.value || '').trim().toLowerCase();
            let matchedPreset = false;

            paletteContainer.querySelectorAll('.preset-swatch').forEach(sw => {
                if (sw.dataset.hex && sw.dataset.hex === rawVal) {
                    sw.classList.add('active');
                    matchedPreset = true;
                } else {
                    sw.classList.remove('active');
                }
            });

            if (!matchedPreset) {
                triggerBtn.classList.add('active');
            } else {
                triggerBtn.classList.remove('active');
            }
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

    /* Custom Dropdown / Select Component */
    function setupCustomSelect(selectEl) {
        if (!selectEl) return;
        if (selectEl.dataset.customSelectInitialized) {
            if (selectEl._updateCustomSelect) selectEl._updateCustomSelect();
            return;
        }
        selectEl.dataset.customSelectInitialized = "true";

        // Hide native select
        selectEl.style.display = 'none';

        // Create custom dropdown container
        const container = document.createElement('div');
        container.className = 'custom-dropdown-container';

        // Trigger button
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-dropdown-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');

        const labelSpan = document.createElement('span');
        labelSpan.className = 'custom-dropdown-label';

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'custom-dropdown-arrow';
        arrowSpan.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;

        trigger.appendChild(labelSpan);
        trigger.appendChild(arrowSpan);
        container.appendChild(trigger);

        // Options dropdown list
        const menu = document.createElement('div');
        menu.className = 'custom-dropdown-menu';
        menu.setAttribute('role', 'listbox');

        const renderOptions = () => {
            menu.innerHTML = '';
            Array.from(selectEl.options).forEach(opt => {
                const item = document.createElement('div');
                item.className = 'custom-dropdown-option';
                item.setAttribute('role', 'option');
                item.dataset.value = opt.value;

                if (opt.value === selectEl.value) {
                    item.classList.add('selected');
                    item.setAttribute('aria-selected', 'true');
                    labelSpan.textContent = opt.textContent;
                } else {
                    item.setAttribute('aria-selected', 'false');
                }

                item.innerHTML = `
                    <span class="option-text">${opt.textContent}</span>
                    <span class="option-check">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </span>
                `;

                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                    syncFromNative();
                    closeMenu();
                });

                menu.appendChild(item);
            });
        };

        container.appendChild(menu);
        selectEl.parentNode.insertBefore(container, selectEl.nextSibling);

        const syncFromNative = () => {
            const currentVal = selectEl.value;
            const currentOpt = Array.from(selectEl.options).find(o => o.value === currentVal) || selectEl.options[0];
            if (currentOpt) {
                labelSpan.textContent = currentOpt.textContent;
            }
            menu.querySelectorAll('.custom-dropdown-option').forEach(item => {
                if (item.dataset.value === currentVal) {
                    item.classList.add('selected');
                    item.setAttribute('aria-selected', 'true');
                } else {
                    item.classList.remove('selected');
                    item.setAttribute('aria-selected', 'false');
                }
            });
        };

        selectEl._updateCustomSelect = () => {
            renderOptions();
            syncFromNative();
        };

        selectEl.addEventListener('change', syncFromNative);

        const openMenu = () => {
            document.querySelectorAll('.custom-dropdown-container.open').forEach(c => {
                if (c !== container) {
                    c.classList.remove('open');
                    const t = c.querySelector('.custom-dropdown-trigger');
                    if (t) t.setAttribute('aria-expanded', 'false');
                }
            });
            container.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
        };

        const closeMenu = () => {
            container.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        };

        const toggleMenu = () => {
            if (container.classList.contains('open')) {
                closeMenu();
            } else {
                openMenu();
            }
        };

        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMenu();
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                closeMenu();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && container.classList.contains('open')) {
                closeMenu();
            }
        });

        renderOptions();
        syncFromNative();
    }

    function enhanceAllCustomUi(root = document) {
        const colorInputs = root.querySelectorAll('input[type="color"]');
        colorInputs.forEach(input => setupColorPicker(input));

        const selects = root.querySelectorAll('select.custom-select, .custom-select-wrapper select');
        selects.forEach(select => setupCustomSelect(select));
    }

    window.enhanceAllCustomUi = enhanceAllCustomUi;

    document.addEventListener('DOMContentLoaded', () => {
        enhanceAllCustomUi();
    });
})();
