import { Song, TrackType, SongTrack } from '../types';

/**
 * Extracts cover art from a local FLAC file completely offline.
 * Parses the binary FLAC structure, finds the PICTURE block (type 6),
 * and creates a local Blob URL.
 */
export async function extractFlacCover(file: File): Promise<string | undefined> {
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    
    // Check "fLaC" magic signature
    if (buffer.byteLength < 4 || view.getUint32(0) !== 0x664c6143) {
      return undefined;
    }
    
    let offset = 4;
    let isLast = false;
    
    while (!isLast && offset < buffer.byteLength) {
      if (offset + 4 > buffer.byteLength) break;
      
      const header = view.getUint8(offset);
      isLast = (header & 0x80) !== 0;
      const blockType = header & 0x7F;
      
      // 24-bit big-endian length
      const length = (view.getUint8(offset + 1) << 16) |
                     (view.getUint8(offset + 2) << 8) |
                     view.getUint8(offset + 3);
                     
      offset += 4;
      
      if (offset + length > buffer.byteLength) break;
      
      if (blockType === 6) { // PICTURE metadata block
        let picOffset = offset;
        
        // 1. Picture type (4 bytes)
        // const picType = view.getUint32(picOffset);
        picOffset += 4;
        
        // 2. MIME type length (4 bytes)
        const mimeLength = view.getUint32(picOffset);
        picOffset += 4;
        
        // 3. MIME type string
        const mimeBytes = new Uint8Array(buffer, picOffset, mimeLength);
        const mimeType = new TextDecoder().decode(mimeBytes);
        picOffset += mimeLength;
        
        // 4. Description length (4 bytes)
        const descLength = view.getUint32(picOffset);
        picOffset += 4;
        
        // 5. Description string
        picOffset += descLength;
        
        // 6. Width (4), Height (4), Depth (4), Colors (4)
        picOffset += 16;
        
        // 10. Picture data length (4 bytes)
        const dataLength = view.getUint32(picOffset);
        picOffset += 4;
        
        // 11. Picture data
        const picData = new Uint8Array(buffer, picOffset, dataLength);
        const blob = new Blob([picData], { type: mimeType });
        return URL.createObjectURL(blob);
      }
      
      offset += length;
    }
  } catch (err) {
    console.error('Fehler beim Extrahieren des FLAC-Covers:', err);
  }
  return undefined;
}

/**
 * Fast offline duration extractor from FLAC header (STREAMINFO block).
 */
export async function extractFlacDuration(file: File): Promise<number | undefined> {
  try {
    const buffer = await file.slice(0, 8192).arrayBuffer();
    const view = new DataView(buffer);

    if (buffer.byteLength < 4 || view.getUint32(0) !== 0x664c6143) {
      return undefined;
    }

    let offset = 4;
    let isLast = false;

    while (!isLast && offset < buffer.byteLength) {
      if (offset + 4 > buffer.byteLength) break;

      const header = view.getUint8(offset);
      isLast = (header & 0x80) !== 0;
      const blockType = header & 0x7F;

      const length = (view.getUint8(offset + 1) << 16) |
                     (view.getUint8(offset + 2) << 8) |
                     view.getUint8(offset + 3);

      offset += 4;

      if (blockType === 0 && length >= 34) { // STREAMINFO block
        const sampleRate = (view.getUint8(offset + 10) << 12) |
                           (view.getUint8(offset + 11) << 4) |
                           (view.getUint8(offset + 12) >> 4);

        const high4Bits = view.getUint8(offset + 13) & 0x0F;
        const low32Bits = view.getUint32(offset + 14);
        const totalSamples = (high4Bits * 4294967296) + low32Bits;

        if (sampleRate > 0 && totalSamples > 0) {
          return totalSamples / sampleRate;
        }
      }

      offset += length;
    }
  } catch (err) {
    console.warn('Could not extract FLAC duration:', err);
  }
  return undefined;
}

interface LocalFileInfo {
  name: string;
  handle: FileSystemFileHandle;
}

/**
 * Scans a folder recursively using the File System Access API
 * and registers all valid multi-track songs.
 */
export async function scanLocalDirectory(
  rootHandle: FileSystemDirectoryHandle,
  onProgress?: (scannedFolders: number, songsFound: number) => void
): Promise<Song[]> {
  const songs: Song[] = [];
  let scannedFolders = 0;
  let songsFound = 0;

  // Recursive walker
  async function walk(
    dirHandle: FileSystemDirectoryHandle,
    parentNames: string[]
  ) {
    scannedFolders++;
    
    const files: LocalFileInfo[] = [];
    const subDirs: FileSystemDirectoryHandle[] = [];

    // Read entries
    for await (const entry of (dirHandle as any).values()) {
      if (entry.kind === 'file') {
        files.push({ name: entry.name, handle: entry });
      } else if (entry.kind === 'directory') {
        subDirs.push(entry);
      }
    }

    // Check if this folder itself contains song tracks
    const audioFiles = files.filter(f => 
      /\.(wav|wave|mp3|flac|m4a|ogg|aac|wma|mp4|webm)$/i.test(f.name)
    );

    if (audioFiles.length > 0) {
      // Analyze files to see if it's a song folder
      const flacFile = files.find(f => /\.flac$/i.test(f.name));
      const wavFiles = files.filter(f => /\.(wav|wave|mp3|flac|m4a|ogg|aac|wma|mp4|webm)$/i.test(f.name));

      if (flacFile || wavFiles.length > 0) {
        // We found a song! Let's extract title/artist from directory name
        const folderName = dirHandle.name;
        
        // e.g. "Addicted to Love – Robert Palmer"
        let title = folderName;
        let subtitle = 'Local Import';

        // Robust split on any dash/hyphen/en-dash/em-dash with surrounding optional spaces
        const dashRegex = /\s*[-–—]\s*/;
        const dashMatch = folderName.match(dashRegex);
        if (dashMatch) {
          const index = folderName.search(dashRegex);
          const sep = dashMatch[0];
          title = folderName.substring(0, index).trim();
          subtitle = folderName.substring(index + sep.length).trim();
        }

        // Detect BPM from filenames or folder name
        let bpm = 110;
        let foundBpm = false;
        
        // Check file names first
        for (const file of audioFiles) {
          const bpmMatch = file.name.match(/[-_](\d{2,3})\s*bpm/i) || file.name.match(/\b(\d{2,3})\s*bpm\b/i);
          if (bpmMatch) {
            bpm = parseInt(bpmMatch[1], 10);
            foundBpm = true;
            break;
          }
        }
        
        // If not in filenames, check folder name
        if (!foundBpm) {
          const bpmMatch = folderName.match(/[-_](\d{2,3})\s*bpm/i) || folderName.match(/\b(\d{2,3})\s*bpm\b/i);
          if (bpmMatch) {
            bpm = parseInt(bpmMatch[1], 10);
          }
        }

        // Determine which book this song belongs to
        let book = 'Eigene Songs';
        
        // Check all parent folders (closest first)
        const parentFoldersReversed = [...parentNames].reverse();
        const bookMatch = parentFoldersReversed.find(p => {
          const pLower = p.toLowerCase();
          return pLower.includes('pop') || pLower.includes('simple') || pLower.includes('easiest') || pLower.includes('rock') || pLower.includes('first 50') || pLower.includes('easy');
        });

        if (bookMatch) {
          const bLower = bookMatch.toLowerCase();
          if (bLower.includes('pop')) {
            book = 'First 50 Pop Songs You should play on Drums';
          } else if (bLower.includes('simple') || bLower.includes('easiest') || bLower.includes('easy')) {
            book = 'Simple Songs - The Easiest Easy Drum Songbook Ever';
          } else if (bLower.includes('rock') || bLower.includes('first 50')) {
            book = 'First 50 Songs You should play on Drums';
          }
        } else {
          // Fallback check on the entire path string
          const pathString = [...parentNames, folderName].join('/').toLowerCase();
          if (pathString.includes('pop') || pathString.includes('first 50 pop')) {
            book = 'First 50 Pop Songs You should play on Drums';
          } else if (pathString.includes('simple') || pathString.includes('easiest') || pathString.includes('easy drum') || pathString.includes('easy_drum')) {
            book = 'Simple Songs - The Easiest Easy Drum Songbook Ever';
          } else if (pathString.includes('first 50 songs') || pathString.includes('classic') || pathString.includes('rock') || pathString.includes('first 50')) {
            book = 'First 50 Songs You should play on Drums';
          }
        }

        // Map files to tracks
        const tracks: Partial<Record<TrackType, SongTrack & { fileHandle?: FileSystemFileHandle }>> = {};

        wavFiles.forEach(f => {
          const lower = f.name.toLowerCase();
          let trackType: TrackType | null = null;

          if (lower.includes('drum') || lower.includes('drums') || lower.includes('schlagzeug') || lower.includes('perc') || lower.includes('beat')) {
            trackType = 'Drum';
          } else if (lower.includes('metronom') || lower.includes('click') || lower.includes('klick') || lower.includes('metronome') || lower.includes('count') || lower.includes('guide')) {
            trackType = 'Klick';
          } else if (lower.includes('vocal') || lower.includes('vocals') || lower.includes('gesang') || lower.includes('voice') || lower.includes('stimme') || lower.includes('vox')) {
            trackType = 'Gesang';
          } else if (lower.includes('other') || lower.includes('instrument') || lower.includes('backing') || lower.includes('music') || lower.includes('bass') || lower.includes('guitar') || lower.includes('synth') || lower.includes('keys') || lower.includes('melody') || lower.includes('piano')) {
            trackType = 'Instrumente';
          }

          if (trackType) {
            tracks[trackType] = {
              name: f.name,
              fileHandle: f.handle,
            };
          }
        });

        // Fallback: If some wav files were not categorized but we have empty slots, fill them
        const uncategorizedWavs = wavFiles.filter(f => 
          !Object.values(tracks).some(t => t?.name === f.name)
        );

        if (uncategorizedWavs.length > 0) {
          const trackTypes: TrackType[] = ['Drum', 'Gesang', 'Instrumente', 'Klick'];
          trackTypes.forEach(t => {
            if (!tracks[t] && uncategorizedWavs.length > 0) {
              const fileInfo = uncategorizedWavs.shift()!;
              tracks[t] = {
                name: fileInfo.name,
                fileHandle: fileInfo.handle,
              };
            }
          });
        }

        // Look for any image files in this folder for cover art
        const imageFile = files.find(f => 
          f.name.toLowerCase().endsWith('.jpg') || 
          f.name.toLowerCase().endsWith('.jpeg') || 
          f.name.toLowerCase().endsWith('.png')
        );

        let coverUrl: string | undefined = undefined;
        let localCoverFileHandle: FileSystemFileHandle | undefined = imageFile?.handle;
        let localFlacFileHandle: FileSystemFileHandle | undefined = flacFile?.handle;

        songs.push({
          id: `local_${folderName.replace(/\s+/g, '_')}`,
          title,
          book,
          bpm,
          duration: 0, // Default duration set to 0, will be resolved dynamically once audio is loaded
          tracks: tracks as any,
          coverUrl, // We can resolve coverUrl lazily upon selection!
          isUserAdded: true,
          // Custom properties for our local loader
          isLocalFolderSong: true,
          subtitle,
          localCoverFileHandle,
          localFlacFileHandle,
        } as any);

        songsFound++;
      }
    }

    if (onProgress) {
      onProgress(scannedFolders, songsFound);
    }

    // Walk subfolders
    for (const subDir of subDirs) {
      await walk(subDir, [...parentNames, dirHandle.name]);
    }
  }

  await walk(rootHandle, []);
  return songs;
}

/**
 * Scans a folder uploaded via an <input type="file" webkitdirectory /> tag
 * and groups files into multi-track songs recursively.
 * Works flawlessly in all browsers, even inside secure iframe environments.
 */
export async function scanLocalFilesList(
  files: File[],
  onProgress?: (scannedFolders: number, songsFound: number) => void
): Promise<Song[]> {
  const foldersMap: Record<string, {
    folderName: string;
    parentNames: string[];
    audioFiles: File[];
    imageFile?: File;
    flacFile?: File;
  }> = {};

  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');
    if (parts.length <= 1) continue; // Skip root files with no folder structure

    const fileName = parts[parts.length - 1];
    const folderName = parts[parts.length - 2];
    const parentNames = parts.slice(0, -2);
    
    // Create a unique key for the folder path to group tracks under the same folder
    const folderKey = parts.slice(0, -1).join('/');

    if (!foldersMap[folderKey]) {
      foldersMap[folderKey] = {
        folderName,
        parentNames,
        audioFiles: [],
      };
    }

    const lowerName = fileName.toLowerCase();
    if (/\.(wav|wave|mp3|flac|m4a|ogg|aac|wma|mp4|webm)$/i.test(lowerName)) {
      foldersMap[folderKey].audioFiles.push(file);
      if (lowerName.endsWith('.flac')) {
        foldersMap[folderKey].flacFile = file;
      }
    } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png')) {
      foldersMap[folderKey].imageFile = file;
    }
  }

  const songs: Song[] = [];
  const folderKeys = Object.keys(foldersMap);
  const scannedFoldersCount = folderKeys.length;
  let songsFound = 0;

  for (const folderKey of folderKeys) {
    const { folderName, parentNames, audioFiles, imageFile, flacFile } = foldersMap[folderKey];

    if (audioFiles.length > 0) {
      // Keep all audio files (including flac) as track candidates
      const wavFiles = audioFiles;

      if (flacFile || wavFiles.length > 0) {
        let title = folderName;
        let subtitle = 'Local Import';

        // Robust split on any dash/hyphen/en-dash/em-dash with surrounding optional spaces
        const dashRegex = /\s*[-–—]\s*/;
        const dashMatch = folderName.match(dashRegex);
        if (dashMatch) {
          const index = folderName.search(dashRegex);
          const sep = dashMatch[0];
          title = folderName.substring(0, index).trim();
          subtitle = dashMatch ? folderName.substring(index + sep.length).trim() : 'Local Import';
        }

        // Try to parse BPM
        let bpm = 110;
        let foundBpm = false;
        
        for (const file of audioFiles) {
          const bpmMatch = file.name.match(/[-_](\d{2,3})\s*bpm/i) || file.name.match(/\b(\d{2,3})\s*bpm\b/i);
          if (bpmMatch) {
            bpm = parseInt(bpmMatch[1], 10);
            foundBpm = true;
            break;
          }
        }
        
        if (!foundBpm) {
          const bpmMatch = folderName.match(/[-_](\d{2,3})\s*bpm/i) || folderName.match(/\b(\d{2,3})\s*bpm\b/i);
          if (bpmMatch) {
            bpm = parseInt(bpmMatch[1], 10);
          }
        }

        // Figure out songbook based on parent folders
        let book = 'Eigene Songs';
        
        // Check all parent folders (closest first)
        const parentFoldersReversed = [...parentNames].reverse();
        const bookMatch = parentFoldersReversed.find(p => {
          const pLower = p.toLowerCase();
          return pLower.includes('pop') || pLower.includes('simple') || pLower.includes('easiest') || pLower.includes('rock') || pLower.includes('first 50') || pLower.includes('easy');
        });

        if (bookMatch) {
          const bLower = bookMatch.toLowerCase();
          if (bLower.includes('pop')) {
            book = 'First 50 Pop Songs You should play on Drums';
          } else if (bLower.includes('simple') || bLower.includes('easiest') || bLower.includes('easy')) {
            book = 'Simple Songs - The Easiest Easy Drum Songbook Ever';
          } else if (bLower.includes('rock') || bLower.includes('first 50')) {
            book = 'First 50 Songs You should play on Drums';
          }
        } else {
          // Fallback check on the entire path string
          const pathString = [...parentNames, folderName].join('/').toLowerCase();
          if (pathString.includes('pop') || pathString.includes('first 50 pop')) {
            book = 'First 50 Pop Songs You should play on Drums';
          } else if (pathString.includes('simple') || pathString.includes('easiest') || pathString.includes('easy drum') || pathString.includes('easy_drum')) {
            book = 'Simple Songs - The Easiest Easy Drum Songbook Ever';
          } else if (pathString.includes('first 50 songs') || pathString.includes('classic') || pathString.includes('rock') || pathString.includes('first 50')) {
            book = 'First 50 Songs You should play on Drums';
          }
        }

        const tracks: Partial<Record<TrackType, SongTrack>> = {};

        wavFiles.forEach(f => {
          const lower = f.name.toLowerCase();
          let trackType: TrackType | null = null;

          if (lower.includes('drum') || lower.includes('drums') || lower.includes('schlagzeug') || lower.includes('perc') || lower.includes('beat')) {
            trackType = 'Drum';
          } else if (lower.includes('metronom') || lower.includes('click') || lower.includes('klick') || lower.includes('metronome') || lower.includes('count') || lower.includes('guide')) {
            trackType = 'Klick';
          } else if (lower.includes('vocal') || lower.includes('vocals') || lower.includes('gesang') || lower.includes('voice') || lower.includes('stimme') || lower.includes('vox')) {
            trackType = 'Gesang';
          } else if (lower.includes('other') || lower.includes('instrument') || lower.includes('backing') || lower.includes('music') || lower.includes('bass') || lower.includes('guitar') || lower.includes('synth') || lower.includes('keys') || lower.includes('melody') || lower.includes('piano')) {
            trackType = 'Instrumente';
          }

          if (trackType) {
            tracks[trackType] = {
              name: f.name,
              file: f,
            };
          }
        });

        // Fill empty track slots with leftover wavs
        const uncategorizedWavs = wavFiles.filter(f => 
          !Object.values(tracks).some(t => t?.name === f.name)
        );

        if (uncategorizedWavs.length > 0) {
          const trackTypes: TrackType[] = ['Drum', 'Gesang', 'Instrumente', 'Klick'];
          trackTypes.forEach(t => {
            if (!tracks[t] && uncategorizedWavs.length > 0) {
              const file = uncategorizedWavs.shift()!;
              tracks[t] = {
                name: file.name,
                file,
              };
            }
          });
        }

        let extractedDuration = 0;
        if (flacFile) {
          try {
            const dur = await extractFlacDuration(flacFile);
            if (dur && dur > 0) extractedDuration = dur;
          } catch (e) {
            console.warn('Could not extract flac duration during folder scan:', e);
          }
        }

        songs.push({
          id: `local_upload_${folderName.replace(/\s+/g, '_')}`,
          title,
          book,
          bpm,
          duration: extractedDuration,
          tracks: tracks as any,
          coverUrl: undefined,
          isUserAdded: true,
          isLocalFolderSong: true,
          subtitle,
          localCoverFile: imageFile,
          localFlacFile: flacFile,
        } as any);

        songsFound++;
      }
    }

    if (onProgress) {
      onProgress(scannedFoldersCount, songsFound);
    }
  }

  return songs;
}
