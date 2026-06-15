/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        spotify: {
          green: '#1DB954',
          'green-bright': '#1ed760',
          black: '#121212',
          dark: '#181818',
          darker: '#0d0d0d',
          elevated: '#242424',
          surface: '#242424',
          'surface-2': '#2a2a2a',
          muted: '#727272',
          text: '#b3b3b3',
        },
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'fade-in': 'fadeIn 0.3s ease',
        'slide-up': 'slideUp 0.3s ease',
        'bar1': 'bar 1.2s ease-in-out infinite',
        'bar2': 'bar 1.2s ease-in-out 0.2s infinite',
        'bar3': 'bar 1.2s ease-in-out 0.4s infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { transform: 'translateY(20px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        bar: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(29,185,84,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(29,185,84,0.6)' },
        },
      },
    },
  },
  plugins: [],
}
