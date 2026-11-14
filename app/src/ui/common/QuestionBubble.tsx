// When Claude needs an answer, the alien working on it runs to the front of the lab and
// this bubble pops out of its head. Answers go back through the bus to the waiting tool.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { bus } from '../../core/bus';
import { speakerAnchor, speakerId } from '../../core/crew';
import { crew } from '../../core/state';
import { babble } from '../../audio/sfx';
import { Btn } from './kit';

type Q = { questionId: string; question: string; options?: string[]; runId: string };
export const questions = signal<Q[]>([]);

bus.on('question:ask', (q) => {
  questions.value = [...questions.value, q];
  bus.emit('sfx', { name: 'question', volume: 0.7 });
  setTimeout(() => babble(q.question, 1.1), 250);
});
bus.on('question:answered', ({ questionId }) => { questions.value = questions.value.filter((q) => q.questionId !== questionId); });

export function answerQuestion(questionId: string, answer: string) {
  bus.emit('sfx', { name: 'select', volume: 0.6 });
  bus.emit('question:answered', { questionId, answer });
}

export function QuestionBubble() {
  const q = questions.value[0];
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(''); if (q && !q.options?.length) setTimeout(() => ref.current?.focus(), 200); }, [q?.questionId]);
  if (!q) return null;
  const a = speakerAnchor.value;
  const who = crew.value.find((m) => m.id === (speakerId.value ?? 'blip'));
  const anchored = a?.visible && a.y > 160 && a.y < window.innerHeight - 140;
  const style = anchored
    ? { left: `${Math.min(Math.max(12, a!.x - 40), window.innerWidth - 392)}px`, bottom: `${window.innerHeight - a!.y + 18}px` }
    : { left: '50%', transform: 'translateX(-50%)', bottom: 'calc(var(--dock-h) + 40px)' };
  return (
    <div class="pe" style={{ position: 'fixed', zIndex: 35, width: 'min(380px, calc(100vw - 24px))', ...style }}>
      <div class="bubble col gap-12">
        <div class="who">{who?.name ?? 'Alien'} asks{questions.value.length > 1 ? ` · ${questions.value.length - 1} more waiting` : ''}</div>
        <div style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{q.question}</div>
        {!!q.options?.length && (
          <div class="row wrap gap-8">
            {q.options.map((o) => <button type="button" class="chip" key={o} onClick={() => answerQuestion(q.questionId, o)}>{o}</button>)}
          </div>
        )}
        <form class="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) answerQuestion(q.questionId, text.trim()); }}>
          <input ref={ref} id="question-answer" class="field" placeholder={q.options?.length ? 'Or type your own answer…' : 'Type your answer…'} value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          <Btn type="submit" tone="glob" icon="send" iconOnly title="Answer" />
        </form>
      </div>
    </div>
  );
}
