import { useState, useRef } from 'react';
import { ingestThought, ingestUrl, ingestChat, ingestFile } from '../../api/client';
import useGraphStore from '../../store/graphStore';
import { Thought, Url, Chat, Document, Close } from '../icons/Icons';
import './CaptureModal.css';

const TABS = [
  { id: 'thought', label: 'THOUGHT', icon: Thought },
  { id: 'url', label: 'URL', icon: Url },
  { id: 'chat', label: 'CHAT', icon: Chat },
  { id: 'file', label: 'FILE', icon: Document },
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
          <h3 className="mono uppercase">Full Capture</h3>
          <button className="capture-modal__close" onClick={closeCaptureModal}>
            <Close size={14} />
          </button>
        </div>

        <div className="capture-modal__tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`capture-modal__tab ${tab === t.id ? 'capture-modal__tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={12} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <form className="capture-modal__form" onSubmit={handleSubmit}>
          {tab === 'thought' && (
              <textarea
                className="capture-modal__textarea mono"
                placeholder="WHAT'S ON YOUR MIND?"
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
                placeholder="HTTPS://"
                value={url}
                onChange={e => setUrl(e.target.value)}
                autoFocus
              />
              <input
                className="capture-modal__input mono"
                type="text"
                placeholder="TITLE (OPTIONAL)"
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
                <option value="chatgpt">CHATGPT</option>
                <option value="claude">CLAUDE</option>
                <option value="gemini">GEMINI</option>
                <option value="other">OTHER</option>
              </select>
              <textarea
                className="capture-modal__textarea mono"
                placeholder="PASTE YOUR CHAT CONTENT..."
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
              <p className="secondary mono uppercase" style={{ fontSize: 10 }}>
                Screenshots, videos, PDFs, or documents
              </p>
            </div>
          )}

          <input
            className="capture-modal__input mono"
            type="text"
            placeholder="TAGS (COMMA SEPARATED)"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />

          <button
            className="capture-modal__submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Capture'}
          </button>
        </form>
      </div>
    </div>
  );
}
