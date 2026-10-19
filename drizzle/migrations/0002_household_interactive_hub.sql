CREATE TABLE public.hub_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('shopping','notices','events','bookings','polls','inventory','documents','contacts','rules','lost-found')),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
 details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hub_items TO authenticated;
GRANT ALL ON public.hub_items TO service_role;
ALTER TABLE public.hub_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_read ON public.hub_items FOR SELECT TO authenticated USING (true);
CREATE POLICY hub_create ON public.hub_items FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid() AND (kind NOT IN ('notices','rules','contacts','documents') OR public.is_admin()));
CREATE POLICY hub_delete ON public.hub_items FOR DELETE TO authenticated USING (public.is_admin() OR created_by=auth.uid());
CREATE TABLE public.hub_responses (
 item_id uuid NOT NULL REFERENCES public.hub_items(id) ON DELETE CASCADE,
 user_id uuid NOT NULL DEFAULT auth.uid(),
 value text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(item_id,user_id)
);
GRANT SELECT ON public.hub_responses TO authenticated;
GRANT ALL ON public.hub_responses TO service_role;
ALTER TABLE public.hub_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_responses_read ON public.hub_responses FOR SELECT TO authenticated USING (true);
CREATE OR REPLACE FUNCTION public.hub_item_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s timestamptz; e timestamptz;
BEGIN
 IF NEW.kind='bookings' THEN
  s:=(NEW.payload->>'start')::timestamptz; e:=(NEW.payload->>'end')::timestamptz;
  IF s IS NULL OR e IS NULL OR e<=s OR coalesce(trim(NEW.payload->>'resource'),'')='' THEN RAISE EXCEPTION 'Choose a resource and an end time after the start'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(lower(trim(NEW.payload->>'resource'))));
  IF EXISTS(SELECT 1 FROM public.hub_items WHERE kind='bookings' AND status='open' AND id<>NEW.id AND lower(trim(payload->>'resource'))=lower(trim(NEW.payload->>'resource')) AND (payload->>'start')::timestamptz<e AND (payload->>'end')::timestamptz>s) THEN RAISE EXCEPTION 'This resource is already booked during that time'; END IF;
 END IF;
 IF NEW.kind='polls' AND (jsonb_typeof(NEW.payload->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.payload->'options') NOT BETWEEN 2 AND 6) THEN RAISE EXCEPTION 'Polls need two to six options'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hub_item_validate BEFORE INSERT OR UPDATE ON public.hub_items FOR EACH ROW EXECUTE FUNCTION public.hub_item_guard();
CREATE OR REPLACE FUNCTION public.hub_respond(_item_id uuid,_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.hub_items;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
 SELECT * INTO item FROM public.hub_items WHERE id=_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
 IF item.status='done' THEN RAISE EXCEPTION 'This item is closed'; END IF;
 IF item.kind='polls' THEN
  IF NOT (item.payload->'options' ? _value) THEN RAISE EXCEPTION 'Choose a valid poll option'; END IF;
 ELSIF item.kind='events' THEN
  IF _value NOT IN ('going','maybe','not-going') THEN RAISE EXCEPTION 'Choose a valid response'; END IF;
 ELSIF item.kind IN ('notices','rules') THEN
  IF _value<>'acknowledged' THEN RAISE EXCEPTION 'Invalid acknowledgement'; END IF;
 ELSIF item.kind IN ('inventory','lost-found') THEN
  IF _value='release' THEN
   IF NOT public.is_admin() AND NOT EXISTS(SELECT 1 FROM public.hub_responses WHERE item_id=_item_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Only the borrower or admin can release this'; END IF;
   DELETE FROM public.hub_responses WHERE item_id=_item_id;
   RETURN;
  END IF;
  IF _value<>'claimed' THEN RAISE EXCEPTION 'Invalid claim'; END IF;
  IF EXISTS(SELECT 1 FROM public.hub_responses WHERE item_id=_item_id) THEN RAISE EXCEPTION 'This item is already claimed'; END IF;
 ELSE RAISE EXCEPTION 'This item does not accept responses'; END IF;
 INSERT INTO public.hub_responses(item_id,user_id,value) VALUES (_item_id,auth.uid(),_value) ON CONFLICT(item_id,user_id) DO UPDATE SET value=excluded.value,created_at=now();
END $$;
REVOKE ALL ON FUNCTION public.hub_respond(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hub_respond(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.hub_set_status(_item_id uuid,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.hub_items;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
 SELECT * INTO item FROM public.hub_items WHERE id=_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
 IF _status NOT IN ('open','done') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 IF item.kind<>'shopping' AND NOT public.is_admin() AND item.created_by<>auth.uid() THEN RAISE EXCEPTION 'Only the author or administrator can close this'; END IF;
 UPDATE public.hub_items SET status=_status WHERE id=_item_id;
END $$;
REVOKE ALL ON FUNCTION public.hub_set_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hub_set_status(uuid,text) TO authenticated;
CREATE INDEX hub_items_kind_created ON public.hub_items(kind,created_at DESC);