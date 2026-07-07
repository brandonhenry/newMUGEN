import React from 'react';
import ReactDOM from 'react-dom/client';
import { MoveEditorApp } from './MoveEditorApp';
import '../styles.css';
import './moveEditor.css';

ReactDOM.createRoot(document.getElementById('move-editor-root')!).render(
  <React.StrictMode>
    <MoveEditorApp />
  </React.StrictMode>
);
