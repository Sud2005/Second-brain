import { useState, useRef, useEffect } from 'react';
import { ingestThought } from '../../api/client';
import useGraphStore from '../../store/graphStore';
import { Capture } from '../icons/Icons';
import './QuickCapture.css';

export default function QuickCapture() {
  const quickCaptureOpen = useGraphStore(s => s.quickCaptureOpen);
  const toggleQuickCapture = useGraphStore(s => s.toggleQuickCapture);
  const openCaptureModal = useGraphStore(s => s.openCaptureModal);
  const showToast = useGraphStore(s => s.showToast);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
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
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setValue('');
        toggleQuickCapture();
      }, 450);
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
        className={`quick-capture glass-panel ${success ? 'quick-capture--success' : ''}`}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-capture__header">
          <span className="quick-capture__title mono">NEURAL INPUT</span>
          <span className="quick-capture__hint mono">ESC TO CLOSE · TAB FOR FULL CAPTURE</span>
        </div>
        <div className="quick-capture__body">
        <input
          ref={inputRef}
          className="quick-capture__input mono"
          type="text"
          placeholder="Capture a thought..."
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
          {submitting ? '...' : <><Capture size={14} /><span>ENTER</span></>}
        </button>
        </div>
      </form>
    </div>
  );
}
