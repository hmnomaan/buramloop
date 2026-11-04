import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, getSavedTheme } from './lib/theme';
import './styles/theme.css';

applyTheme(getSavedTheme());

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Client root element #root was not found in index.html.');
}

createRoot(rootElement).render(<App />);
