import React from 'react';
import Board from '@/components/Board';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function ReportBoard() {
  const { language } = usePreferences();
  const title =
    language==='ko' ? '신고하기' :
    language==='ja' ? '通報' :
    language==='zh' ? '举报' :
    'Report';
  return <Board boardType="report" title={title} />;
}


