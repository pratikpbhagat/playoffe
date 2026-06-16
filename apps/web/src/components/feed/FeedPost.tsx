'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { FeedPost, FeedComment } from '@/lib/actions/feed';
import { toggleLikeAction, addCommentAction, deleteCommentAction, deletePostAction } from '@/lib/actions/feed';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function FeedPostCard({
  post,
  viewerPlayerId,
}: {
  post: FeedPost;
  viewerPlayerId: string | null;
}) {
  const [liked, setLiked] = useState(post.viewer_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>(post.comments);
  const [commentBody, setCommentBody] = useState('');
  const [isLikePending, startLikeTransition] = useTransition();
  const [isCommentPending, startCommentTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const isOwn = viewerPlayerId === post.player_id;

  function handleLike() {
    setLiked((prev) => !prev);
    setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
    startLikeTransition(async () => {
      await toggleLikeAction(post.id);
    });
  }

  function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    const body = commentBody;
    setCommentBody('');
    startCommentTransition(async () => {
      const result = await addCommentAction(post.id, body);
      if ('success' in result && result.comment) {
        setComments((prev) => [...prev, result.comment]);
      }
    });
  }

  function handleDeleteComment(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    startCommentTransition(async () => {
      await deleteCommentAction(commentId);
    });
  }

  function handleDeletePost() {
    startDeleteTransition(async () => {
      await deletePostAction(post.id);
    });
  }

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {post.player_photo_url ? (
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
              <Image src={post.player_photo_url} alt={post.player_name} fill className="object-cover" />
            </div>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-brand-300">
              {post.player_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <Link href={`/p/${post.player_username}`} className="text-sm font-semibold text-white hover:text-brand-300 transition-colors">
              {post.player_name}
            </Link>
            <p className="text-[10px] text-slate-600">{timeAgo(post.created_at)}</p>
          </div>
        </div>

        {isOwn && (
          <button
            onClick={handleDeletePost}
            disabled={isDeletePending}
            className="shrink-0 rounded p-1 text-xs text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            title="Delete post"
          >
            🗑
          </button>
        )}
      </div>

      {/* Body */}
      <p className="mt-3 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{post.body}</p>

      {/* Image */}
      {post.image_url && (
        <div className="mt-3 overflow-hidden rounded-lg">
          <Image src={post.image_url} alt="Post image" width={800} height={450} className="w-full max-h-80 object-cover" />
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-4">
        <button
          onClick={handleLike}
          disabled={isLikePending || !viewerPlayerId}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
            liked ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span>{liked ? '❤️' : '🤍'}</span>
          <span>{likeCount > 0 ? likeCount : ''}</span>
        </button>

        <button
          onClick={() => setShowComments((p) => !p)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
        >
          <span>💬</span>
          <span>{comments.length > 0 ? comments.length : ''}</span>
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-3 border-t border-surface-border pt-3 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 group">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold text-slate-500">
                {c.player_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-300">
                  <Link href={`/p/${c.player_username}`} className="hover:text-brand-300">{c.player_name}</Link>
                </span>
                <span className="ml-1.5 text-xs text-slate-400">{c.body}</span>
              </div>
              {(viewerPlayerId === c.player_id || viewerPlayerId === post.player_id) && (
                <button
                  onClick={() => handleDeleteComment(c.id)}
                  className="shrink-0 text-[10px] text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {viewerPlayerId && (
            <form onSubmit={handleComment} className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Add a comment…"
                maxLength={300}
                className="flex-1 rounded-lg bg-surface px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none ring-1 ring-surface-border focus:ring-brand-600/50 transition-colors"
              />
              <button
                type="submit"
                disabled={isCommentPending || !commentBody.trim()}
                className="rounded-lg bg-surface-card px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white ring-1 ring-surface-border hover:ring-slate-500 disabled:opacity-40 transition-colors"
              >
                Send
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
