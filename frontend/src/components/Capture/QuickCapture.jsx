import { useState, useRef, useEffect } from 'react';
import { ingestThought } from '../../api/client';
import useGraphStore from '../../store/graphStore';
import './QuickCapture.css';

export default function QuickCapture() {
  const quickCaptureOpen = useGraphStore(s => s.quickCaptureOpen);
  const toggleQuickCapture = useGraphStore(s => s.toggleQuickCapture);
  const openCaptureModal = useGraphStore(s => s.openCaptureModal);
  const showToast = useGraphStore(s => s.showToast);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (quickCaptureOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [quickCaptureOpen]);

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleQuickCapture();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleQuickCapture]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    try {
      await ingestThought(value.trim());
      showToast(`Captured: "${value.slice(0, 40)}..."`, 'success');
      setValue('');
      toggleQuickCapture();
    } catch {
      showToast('Failed to capture thought.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') toggleQuickCapture();
    if (e.key === 'Tab') { e.preventDefault(); openCaptureModal(); }
  };

  if (!quickCaptureOpen) return null;

  return (
    <div className="quick-capture__backdrop" onClick={toggleQuickCapture}>
      <form
        className="quick-capture glass-panel"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="quick-capture__input mono"
          type="text"
          placeholder="Capture a thought... (Tab for more options)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
        />
        <button
          className="quick-capture__submit"
          type="submit"
          disabled={submitting || !value.trim()}
        >
          {submitting ? '...' : '↵'}
        </button>
      </form>
    </div>
  );
}
