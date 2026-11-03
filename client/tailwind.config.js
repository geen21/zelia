export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Bricolage Grotesque', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif']
      },
      colors: {
        surface: '#ffffff',
        line: '#E5E7EB',
        text: { primary: '#1F2937', secondary: '#6B7280' },
        status: { green: '#10B981', amber: '#F59E0B', red: '#EF4444' }
      },
      boxShadow: { card: '0 1px 2px rgba(0,0,0,0.04)' },
      borderRadius: { xl: '14px' }
    }
  }
}
