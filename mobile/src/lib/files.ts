// Saving a generated file (a spreadsheet or a backup): the share sheet on phones.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveFile(name: string, text: string, type: string){
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  await f.write(text);
  await Sharing.shareAsync(f.uri, {mimeType: type, dialogTitle: name});
}
