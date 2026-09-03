"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { QuizQuestion } from "@/components/hq/sops/constants";
import { acknowledgeSop } from "@/server/actions/sops";

export function SopAcknowledge({ sopId, version, acknowledgedAt, quiz }: { sopId: string; version: number; acknowledgedAt: string | null; quiz: QuizQuestion[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [showQuiz, setShowQuiz] = React.useState(false);
  const [answers, setAnswers] = React.useState<(number | null)[]>(() => quiz.map(() => null));
  const [wrong, setWrong] = React.useState<number[]>([]);
  const [checked, setChecked] = React.useState(false);

  if (acknowledgedAt) {
    return (
      <div className="rounded-xl border border-ok/30 bg-ok-soft/60 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ok">
          <CheckCircle2 className="size-4" /> You acknowledged version {version}
        </div>
        <p className="mt-1 text-xs text-ink-2">On {fmtDate(acknowledgedAt, { year: "numeric" })}. If a new version is published you will be asked again.</p>
      </div>
    );
  }

  const submit = (quizAnswers?: number[]) =>
    start(async () => {
      const r = await acknowledgeSop(sopId, version, null, quizAnswers);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data && r.data.wrong.length > 0) {
        setWrong(r.data.wrong);
        setChecked(true);
        toast.error(`${r.data.wrong.length} answer${r.data.wrong.length === 1 ? " is" : "s are"} not right. Read the SOP again and fix them.`);
        return;
      }
      toast.success("Thanks. Acknowledged.");
      router.refresh();
    });

  const allAnswered = answers.every((a) => a !== null);

  return (
    <div className="rounded-xl border border-warn/40 bg-warn-soft/50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-warn">
        <ClipboardCheck className="size-4" /> Needs your acknowledgment
      </div>
      <p className="mt-1 text-xs text-ink-2">{quiz.length ? `Read the SOP, then answer ${quiz.length} short question${quiz.length === 1 ? "" : "s"}. You need every answer right.` : "Read the whole SOP, then confirm you understood it."}</p>
      {!quiz.length ? (
        <Button className="mt-3 w-full" loading={pending} onClick={() => submit()}>
          I have read and understood this
        </Button>
      ) : !showQuiz ? (
        <Button className="mt-3 w-full" onClick={() => setShowQuiz(true)}>
          Start the {quiz.length} question check
        </Button>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {quiz.map((q, qi) => {
            const isWrong = checked && wrong.includes(qi);
            const isRight = checked && !wrong.includes(qi);
            return (
              <fieldset key={qi} className={cn("rounded-lg border bg-surface p-3", isWrong ? "border-bad" : isRight ? "border-ok" : "border-line")}>
                <legend className="px-1 text-[13px] font-semibold text-ink">
                  {qi + 1}. {q.question}
                </legend>
                <div className="mt-1 flex flex-col gap-1">
                  {q.options.map((o, oi) => (
                    <label key={oi} className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2", answers[qi] === oi && "bg-brand-tint/50")}>
                      <input
                        type="radio"
                        name={`q-${qi}`}
                        className="mt-0.5 accent-brand"
                        checked={answers[qi] === oi}
                        onChange={() => {
                          setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)));
                          if (checked) setWrong((w) => w.filter((x) => x !== qi));
                        }}
                      />
                      <span className="text-ink-2">{o}</span>
                    </label>
                  ))}
                </div>
                {isWrong ? (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-bad">
                    <XCircle className="size-3.5" /> Not right. Check the SOP and pick again.
                  </p>
                ) : isRight ? (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-ok">
                    <CheckCircle2 className="size-3.5" /> Correct
                  </p>
                ) : null}
              </fieldset>
            );
          })}
          <Button loading={pending} disabled={!allAnswered} onClick={() => submit(answers.map((a) => a ?? -1))}>
            {checked ? "Check again and acknowledge" : "Check my answers and acknowledge"}
          </Button>
        </div>
      )}
    </div>
  );
}
