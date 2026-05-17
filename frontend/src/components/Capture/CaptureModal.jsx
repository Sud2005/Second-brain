import { useState, useRef } from 'react';
import { ingestThought, ingestUrl, ingestChat, ingestFile } from '../../api/client';
import useGraphStore from '../../store/graphStore';
import './CaptureModal.css';

const TABS = [
  { id: 'thought', label: '💭 Thought' },
  { id: 'url', label: '🔗 URL' },
  { id: 'chat', label: '🤖 Chat' },
  { id: 'file', label: '📄 File' },
];

export default function CaptureModal() {
  const captureModalOpen = useGraphStore(s => s.captureModalOpen);
  const closeCaptureModal = useGraphStore(s => s.closeCaptureModal);
  const showToast = useGraphStore(s => s.showToast);

  const [tab, setTab] = useState('thought');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('chatgpt');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  if (!captureModalOpen) return null;

  const parseTags = () => tags.split(',').map(t => t.trim()).filter(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      switch (tab) {
        case 'thought':
          await ingestThought(content, parseTags());
          showToast('Thought captured!', 'success');
          break;
        case 'url':
          await ingestUrl(url, title || null, parseTags());
          showToast('URL saved!', 'success');
          break;
        case 'chat':
          await ingestChat(platform, content, parseTags());
          showToast('Chat imported!', 'success');
          break;
        case 'file':
          if (fileRef.current?.files[0]) {
            await ingestFile(fileRef.current.files[0]);
            showToast('File uploaded!', 'success');
          }
          break;
      }
      setContent(''); setUrl(''); setTitle(''); setTags('');
      closeCaptureModal();
    } catch {
      showToast('Capture failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="capture-modal__backdrop" onClick={closeCaptureModal}>
      <div className="capture-modal glass-panel" onClick={e => e.stopPropagation()}>
        <div className="capture-modal__header">
          <h3>Capture</h3>
          <button className="capture-modal__close" onClick={closeCaptureModal}>✕</button>
        </div>

        <div className="capture-modal__tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`capture-modal__tab ${tab === t.id ? 'capture-modal__tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form className="capture-modal__form" onSubmit={handleSubmit}>
          {tab === 'thought' && (
            <textarea
              className="capture-modal__textarea mono"
              placeholder="What's on your mind?"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              autoFocus
            />
          )}

          {tab === 'url' && (
            <>
              <input
                className="capture-modal__input mono"
                type="url"
                placeholder="https://..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                autoFocus
              />
              <input
                className="capture-modal__input mono"
                type="text"
                placeholder="Title (optional)"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </>
          )}

          {tab === 'chat' && (
            <>
              <select
                className="capture-modal__input mono"
                value={platform}
                onChange={e => setPlatform(e.target.value)}
              >
                <option value="chatgpt">ChatGPT</option>
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="other">Other</option>
              </select>
              <textarea
                className="capture-modal__textarea mono"
                placeholder="Paste your chat content..."
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={6}
              />
            </>
          )}

          {tab === 'file' && (
            <div className="capture-modal__file-area">
              <input
                ref={fileRef}
                type="file"
                className="capture-modal__file-input"
                accept="image/*,video/*,.pdf,.txt,.md,.doc,.docx"
              />
              <p className="secondary mono" style={{ fontSize: 11 }}>
                Screenshots, videos, PDFs, or documents
              </p>
            </div>
          )}

          <input
            className="capture-modal__input mono"
            type="text"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />

          <button
            className="capture-modal__submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Capture →'}
          </button>
        </form>
      </div>
    </div>
  );
}
