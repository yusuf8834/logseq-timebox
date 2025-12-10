import React from "react";
import type { EventContentArg } from "@fullcalendar/core";

// Local props type to avoid circular import issues
export interface CalendarEventContentProps {
  eventInfo: EventContentArg;
  editingEventId: string | null;
  editingText: string;
  editInputRef: React.RefObject<HTMLTextAreaElement | null>;
  hoveredEventId: string | null;
  setHoveredEventId: (id: string | null) => void;
  setEditingText: (text: string) => void;
  handleSaveEdit: () => void;
  handleClearSchedule: (blockUuid: string, e: React.MouseEvent) => void;
  handleEditClick: (blockUuid: string, e: React.MouseEvent) => void;
  collapseNamespacesInTitle: (title: string) => string;
}

export const CalendarEventContent: React.FC<CalendarEventContentProps> = ({
  eventInfo,
  editingEventId,
  editingText,
  editInputRef,
  hoveredEventId,
  setHoveredEventId,
  setEditingText,
  handleSaveEdit,
  handleClearSchedule,
  handleEditClick,
  collapseNamespacesInTitle,
}) => {
  const blockUuid = eventInfo.event.extendedProps.blockUuid;
  const fullTitle = eventInfo.event.title;
  const displayTitle = collapseNamespacesInTitle(fullTitle);
  const isEditing = editingEventId === blockUuid;

  if (isEditing) {
    return (
      <div 
        className="fc-event-content-wrapper" 
        style={{ 
          display: 'flex', 
          alignItems: 'flex-start', 
          width: '100%', 
          height: '100%', 
          padding: '2px 4px',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <textarea
          ref={editInputRef}
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={(e) => {
            // Stop propagation for ALL keys to prevent FullCalendar from intercepting
            e.stopPropagation();
            // Enter without shift saves, Escape also saves
            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
              e.preventDefault();
              handleSaveEdit();
            }
          }}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyPress={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: 'inherit',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            padding: '2px 4px',
            margin: '0',
            borderRadius: '2px',
            resize: 'none',
            overflow: 'hidden',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            whiteSpace: 'normal',
            lineHeight: '1.2',
          }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div 
      className="fc-event-content-wrapper" 
      title={fullTitle} 
      style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        width: '100%', 
        height: '100%', 
        overflow: 'hidden', 
        padding: '2px 4px',
        position: 'relative'
      }}
      onMouseEnter={() => setHoveredEventId(blockUuid)}
      onMouseLeave={() => setHoveredEventId(null)}
    >
      <div style={{ 
        flex: 1, 
        overflow: 'hidden', 
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        whiteSpace: 'normal',
        lineHeight: '1.2'
      }}>
        <span>{displayTitle}</span>
      </div>
      <div 
        className="fc-event-actions" 
        style={{ 
          position: 'absolute',
          top: '2px',
          right: '2px',
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '2px',
          opacity: hoveredEventId === blockUuid ? 1 : 0,
          pointerEvents: hoveredEventId === blockUuid ? 'auto' : 'none',
          transition: 'opacity 0.15s'
        }}
      >
        <button
          onClick={(e) => handleClearSchedule(blockUuid, e)}
          className="fc-action-btn"
          title="Clear schedule"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '3px',
            backgroundColor: 'rgba(0,0,0,0.1)',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <button
          onClick={(e) => handleEditClick(blockUuid, e)}
          className="fc-action-btn"
          title="Edit"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '3px',
            backgroundColor: 'rgba(0,0,0,0.1)',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

