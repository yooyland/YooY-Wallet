import React from 'react';
import Board from '@/components/Board';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function BugBoard() {
  const { language } = usePreferences();
  const title =
    language==='ko' ? '버그 신고' :
    language==='ja' ? 'バグ報告' :
    language==='zh' ? '错误反馈' :
    'Bug Report';
  return <Board boardType="bug" title={title} />;
}


