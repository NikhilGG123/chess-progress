-- A note about the class itself
--
-- session_notes holds a note per student per class. The coaches' existing
-- system also has one about the class as a whole -- "no lesson, tournament
-- prep", that sort of thing -- and they use it. Without somewhere to put it,
-- those notes would be dropped on import.

alter table sessions add column notes text;
