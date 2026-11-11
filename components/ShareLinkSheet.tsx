import { useState } from 'react';
import { Share, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import ActionSheet from './ActionSheet';
import ChatPickerSheet from './ChatPickerSheet';
import ShareImageModal from './ShareImageModal';
import { forwardTo } from '@/lib/forward';
import { saveVideoIfAllowed, saveMediaWithAlert } from '@/lib/download';

// Share a Flitters link (post, comment, profile): send it to one of your
// chats, share it to any other app, or copy it. The link opens in the app.
export default function ShareLinkSheet({
  visible,
  url,
  title,
  userId,
  videoUrl,
  imageUrl,
  post,
  onClose,
}: {
  visible: boolean;
  url: string;
  title?: string;
  userId?: string;
  // When the post has a video (verified accounts only) or a picture, a Save option is added.
  videoUrl?: string | null;
  imageUrl?: string | null;
  // When given, a "Share as picture" option makes a branded Flitters card of the post.
  post?: any;
  onClose: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  const send = async (targets: any[]) => {
    if (!userId) return;
    setBusy(true);
    const r = await forwardTo(targets, userId, { content: url });
    setBusy(false);
    setPicker(false);
    if (r.failed) Alert.alert('Sent to ' + r.sent, r.failed + ' chat(s) did not accept it. Please try again.');
    else Alert.alert('Sent', r.sent === 1 ? 'Sent in a message.' : `Sent to ${r.sent} chats.`);
  };

  return (
    <>
      <ActionSheet
        visible={visible}
        title={title || 'Share'}
        onClose={onClose}
        options={[
          { label: 'Send in a message', icon: 'paper-plane-outline', onPress: () => { onClose(); setTimeout(() => setPicker(true), 250); } },
          { label: 'Share to other apps', icon: 'share-social-outline', onPress: () => { onClose(); setTimeout(() => Share.share({ message: url, url }).catch(() => {}), 250); } },
          ...(post ? [{ label: 'Share as picture', icon: 'image-outline' as const, onPress: () => { onClose(); setTimeout(() => setCardOpen(true), 250); } }] : []),
          ...(videoUrl ? [{ label: 'Save video', icon: 'download-outline' as const, onPress: () => { onClose(); setTimeout(() => saveVideoIfAllowed(userId, videoUrl), 250); } }] : []),
          ...(!videoUrl && imageUrl ? [{ label: 'Save picture', icon: 'download-outline' as const, onPress: () => { onClose(); setTimeout(() => saveMediaWithAlert(imageUrl, 'image'), 250); } }] : []),
          {
            label: 'Copy link',
            icon: 'link-outline',
            onPress: async () => {
              onClose();
              try {
                await Clipboard.setStringAsync(url);
                Alert.alert('Link copied', 'Anyone with the app who opens it lands right here.');
              } catch {
                Alert.alert("Couldn't copy", url);
              }
            },
          },
        ]}
      />
      {!!post && <ShareImageModal visible={cardOpen} post={post} onClose={() => setCardOpen(false)} />}
      <ChatPickerSheet visible={picker} userId={userId} title="Send to" busy={busy} onClose={() => setPicker(false)} onSend={send} />
    </>
  );
}
