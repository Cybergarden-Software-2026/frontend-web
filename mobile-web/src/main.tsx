import {createRoot} from 'react-dom/client';
import {App} from './App.tsx';
import './style.css';
createRoot(document.getElementById('root')!).render(<App/>);
if(import.meta.env.PROD)void import('./push.ts').then(p=>p.setupWorker()).catch(()=>{});
