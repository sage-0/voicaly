import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 「?」ヘルプバッジ + 説明ポップオーバー。
 *
 * 旧実装は `.param-help::after` の CSS ツールチップだったが、これは
 * position:absolute なため、祖先の overflow:hidden / overflow-x:auto
 * (アコーディオンのパネルや Candidates テーブル) にクリップされ、
 * セクション上端やテーブル見出しでは説明が UI に被って欠けていた。
 *
 * ここではツールチップを position:fixed で <body> 直下のポータルに描画し、
 * 位置を JS (getBoundingClientRect) で計算する。overflow にも stacking
 * context にも縛られないので、どこに置いても全文が前面に表示される。
 */
interface HelpIconProps {
  title: string;
}

interface TipPos {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
}

const TIP_MAX_W = 320; // .param-tooltip の max-width と一致させる (はみ出しクランプ用)
const GAP = 8;         // アイコンとツールチップの隙間 (px)

export function HelpIcon({ title }: HelpIconProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<TipPos | null>(null);

  const compute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 上に十分な余白があれば上、無ければ下に出して画面外に逃げないようにする
    const placement: 'top' | 'bottom' = r.top > 140 ? 'top' : 'bottom';
    const half = TIP_MAX_W / 2;
    // 中央寄せのまま左右が画面外に出ないよう中心 X をクランプ
    const left = Math.min(
      Math.max(r.left + r.width / 2, half + GAP),
      window.innerWidth - half - GAP,
    );
    const top = placement === 'top' ? r.top - GAP : r.bottom + GAP;
    setPos({ left, top, placement });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  // 表示中にスクロール / リサイズされたら追従させる
  const isOpen = pos !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onMove = () => compute();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [isOpen, compute]);

  return (
    <>
      <span
        ref={ref}
        className="param-help"
        tabIndex={0}
        role="img"
        aria-label={title}
        onMouseEnter={compute}
        onMouseLeave={hide}
        onFocus={compute}
        onBlur={hide}
      >
        ?
      </span>
      {pos && createPortal(
        <div
          role="tooltip"
          className={`param-tooltip param-tooltip--${pos.placement}`}
          style={{ left: pos.left, top: pos.top }}
        >
          {title}
        </div>,
        document.body,
      )}
    </>
  );
}
