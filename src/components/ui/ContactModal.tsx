"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './dialog';
import { Button } from './button';
import { Input } from './input';
import { Loader2, Send, Mail } from 'lucide-react';
import { bffPost } from '@/lib/bff-client';
import { toast } from 'sonner';

interface ContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ContactModal({ open, onOpenChange }: ContactModalProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('문의 내용을 입력해주세요.');
      return;
    }

    setSending(true);
    try {
      await bffPost('/api/contact', {
        subject: subject.trim() || '문의사항',
        message: message.trim(),
      });
      toast.success('문의가 전송되었습니다. 빠른 시일 내에 답변드리겠습니다.');
      setSubject('');
      setMessage('');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || '문의 전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-600" />
            </div>
            <DialogTitle>관리자에게 문의</DialogTitle>
          </div>
          <DialogDescription>
            앱 사용 중 불편한 점이나 문의사항을 보내주세요. 관리자에게 앱 알림과 이메일로 전달됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">제목 (선택)</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="문의 제목을 입력하세요"
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">문의 내용 *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="문의하실 내용을 자세히 적어주세요..."
              rows={5}
              maxLength={2000}
              className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
            <span className="text-[10px] text-slate-400">{message.length}/2000</span>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            취소
          </DialogClose>
          <Button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Send className="w-4 h-4 mr-1" />
            )}
            {sending ? '전송 중...' : '보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
