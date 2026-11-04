import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// Palette taken from temec.com.br: amber #FFC107 (hover #FABD00), deep amber #785900
// for text on light backgrounds, charcoal #1A1C1C / #2C2E2E / #101111 for dark surfaces.
export const temecColors = {
    amber: {
        50: '#fff9e6',
        100: '#ffefbf',
        200: '#ffe48f',
        300: '#ffd95e',
        400: '#ffcd2e',
        500: '#ffc107',
        600: '#fabd00',
        700: '#c79500',
        800: '#a07800',
        900: '#785900',
        950: '#4a3700'
    },
    charcoal: {
        0: '#ffffff',
        50: '#f9f9f9',
        100: '#f1f2f2',
        200: '#e3e4e4',
        300: '#c9cbcb',
        400: '#a0a3a3',
        500: '#737777',
        600: '#525555',
        700: '#3a3d3d',
        800: '#2c2e2e',
        900: '#1a1c1c',
        950: '#101111'
    }
};

export const TemecPreset = definePreset(Aura, {
    primitive: {
        amber: temecColors.amber,
        charcoal: temecColors.charcoal
    },
    semantic: {
        primary: temecColors.amber,
        colorScheme: {
            light: {
                surface: temecColors.charcoal,
                primary: {
                    color: '{primary.500}',
                    contrastColor: '{surface.900}',
                    hoverColor: '{primary.600}',
                    activeColor: '{primary.700}'
                },
                // Amber text is unreadable on white, so highlighted items use the deep amber
                highlight: {
                    background: '{primary.50}',
                    focusBackground: '{primary.100}',
                    color: '{primary.900}',
                    focusColor: '{primary.950}'
                }
            },
            dark: {
                surface: temecColors.charcoal,
                primary: {
                    color: '{primary.500}',
                    contrastColor: '{surface.900}',
                    hoverColor: '{primary.400}',
                    activeColor: '{primary.300}'
                },
                highlight: {
                    background: 'color-mix(in srgb, {primary.500}, transparent 84%)',
                    focusBackground: 'color-mix(in srgb, {primary.500}, transparent 76%)',
                    color: '{primary.400}',
                    focusColor: '{primary.300}'
                }
            }
        }
    }
});
