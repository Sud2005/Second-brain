import { Component } from 'react';

/*
  Catches Three.js WebGL errors and falls back to 2D.
  Wraps the 3D canvas in a safe boundary.
*/
export default class GraphErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[GraphErrorBoundary] 3D rendering failed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%', color: '#888', fontFamily: 'var(--font-mono)',
          fontSize: 13, flexDirection: 'column', gap: 8,
        }}>
          <span>3D rendering failed. Switching to 2D...</span>
        </div>
      );
    }
    return this.props.children;
  }
}
