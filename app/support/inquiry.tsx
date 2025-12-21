import React from 'react';
import Board from '@/components/Board';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function InquiryBoard() {
  const { language } = usePreferences();
  const title =
    language==='ko' ? '문의하기' :
    language==='ja' ? 'お問い合わせ' :
    language==='zh' ? '咨询' :
    'Inquiry';
  return <Board boardType="inquiry" title={title} />;
}


