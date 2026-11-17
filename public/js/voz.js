// Dictado con el reconocimiento de voz del navegador (Chrome, Edge, Safari), copiado de Charlize.
// El texto dictado va al asistente de IA, que rellena el formulario; siempre se revisa antes de crear.

import { html, useState, useEffect, useRef } from '/vendor/preact-htm.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const vozSoportada = !!SR;

// Dictado continuo. onFinal recibe cada frase reconocida ya cerrada.
export function useDictado(onFinal) {
  const [escuchando, setEscuchando] = useState(false);
  const [provisional, setProvisional] = useState('');
  const [error, setError] = useState(null);
  const rec = useRef(null);
  const cb = useRef(onFinal); cb.current = onFinal;
  useEffect(() => () => rec.current?.abort(), []);
  function iniciar(lang = 'es-ES') {
    if (!SR) return;
    const r = new SR();
    r.lang = lang; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let prov = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) cb.current(t.trim()); else prov += t;
      }
      setProvisional(prov);
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone access was blocked: allow it in the browser and try again.' : e.error === 'no-speech' ? null : `Voice error: ${e.error}`);
    r.onend = () => { setEscuchando(false); setProvisional(''); };
    rec.current = r; setError(null); r.start(); setEscuchando(true);
  }
  const parar = () => rec.current?.stop();
  return { escuchando, provisional, error, iniciar, parar };
}
