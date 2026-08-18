import { memo, useCallback, useRef, useState, type ReactNode } from 'react'
import { Platform, ScrollView, StyleSheet } from 'react-native'
import RNFS from 'react-native-fs'

import Button from '@/components/common/Button'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import { getLyricInfo, getMusicUrl, getPicPath } from '@/core/music'
import { usePlayMusicInfo } from '@/store/player/hook'
import settingState from '@/store/setting/state'
import { useTheme } from '@/store/theme/hook'
import { downloadFile, mkdir, temporaryDirectoryPath, unlink } from '@/utils/fs'
import { writeLyric, writeMetadata, writePic } from '@/utils/localMediaMetadata'
import { QUALITYS } from '@/utils/musicSdk/utils'
import { formatMusicName, requestStoragePermission, toast } from '@/utils/tools'

type DownloadQuality = LX.Quality

interface QualityOption {
  quality: DownloadQuality
  size: string
}

interface DownloadResult {
  path: string
  warnings: string[]
}

interface Props {
  renderButton: (onPress: () => void) => ReactNode
}

const qualityLabels: Record<DownloadQuality, string> = {
  flac24bit: 'FLAC 24bit',
  flac: 'FLAC',
  wav: 'WAV',
  ape: 'APE',
  '320k': '320K MP3',
  '192k': '192K MP3',
  '128k': '128K MP3',
}

const getQualitySize = (musicInfo: LX.Music.MusicInfoOnline, quality: DownloadQuality) => {
  return musicInfo.meta._qualitys[quality]?.size ?? '未知大小'
}

const getFileExtension = (quality: DownloadQuality) => {
  if (quality.startsWith('flac')) return 'flac'
  if (quality == 'wav') return 'wav'
  if (quality == 'ape') return 'ape'
  return 'mp3'
}

const sanitizeFileName = (name: string) => {
  // Preserve readable unicode names while removing characters rejected by Android and iOS.
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/g, '').trim()
  return safeName.slice(0, 60).replace(/[. ]+$/g, '') || '未知歌曲'
}

const isSuccessfulDownload = (statusCode: number) => statusCode >= 200 && statusCode < 300

const getAvailableFilePath = async(dir: string, fileName: string, extension: string) => {
  let filePath = `${dir}/${fileName}.${extension}`
  let duplicateIndex = 1
  while (await RNFS.exists(filePath)) {
    filePath = `${dir}/${fileName} (${duplicateIndex++}).${extension}`
  }
  return filePath
}

let activeDownloadTask: Promise<void> | null = null

const downloadMusic = async(
  musicInfo: LX.Music.MusicInfoOnline,
  quality: DownloadQuality,
): Promise<DownloadResult> => {
  const rootPath = Platform.OS == 'android' ? RNFS.ExternalStorageDirectoryPath : RNFS.DocumentDirectoryPath
  const downloadDir = `${rootPath}/Music`
  const fileName = sanitizeFileName(formatMusicName(settingState.setting['download.fileName'], musicInfo.name, musicInfo.singer))
  const warnings: string[] = []

  await mkdir(downloadDir).catch(() => {
    // The directory may already exist. The file download reports real permission errors below.
  })
  const filePath = await getAvailableFilePath(downloadDir, fileName, getFileExtension(quality))

  const url = await getMusicUrl({
    musicInfo,
    quality,
    isRefresh: true,
    onToggleSource: () => {},
  })
  if (!url) throw new Error('获取下载链接失败')

  try {
    const result = await downloadFile(url, filePath, {
      connectionTimeout: 15000,
      readTimeout: 30000,
    }).promise
    if (!isSuccessfulDownload(result.statusCode)) throw new Error(`下载请求失败 (${result.statusCode})`)
  } catch (error) {
    await unlink(filePath).catch(() => {})
    throw error
  }

  try {
    await writeMetadata(filePath, {
      name: musicInfo.name,
      singer: musicInfo.singer,
      albumName: musicInfo.meta.albumName || '',
    })
  } catch (error) {
    console.warn('写入音乐元数据失败', error)
    warnings.push('元数据')
  }

  try {
    const lyricInfo = await getLyricInfo({ musicInfo, isRefresh: false, onToggleSource: () => {} })
    if (lyricInfo.lyric) await writeLyric(filePath, lyricInfo.lyric)
  } catch (error) {
    console.warn('写入歌词失败', error)
    warnings.push('歌词')
  }

  let coverPath: string | null = null
  try {
    const picUrl = await getPicPath({ musicInfo, isRefresh: false, onToggleSource: () => {} })
    if (picUrl) {
      coverPath = `${temporaryDirectoryPath}/lx-music-cover-${Date.now()}.jpg`
      const result = await downloadFile(picUrl, coverPath, {
        connectionTimeout: 10000,
        readTimeout: 20000,
      }).promise
      if (!isSuccessfulDownload(result.statusCode)) throw new Error(`封面请求失败 (${result.statusCode})`)
      await writePic(filePath, coverPath)
    }
  } catch (error) {
    console.warn('写入封面失败', error)
    warnings.push('封面')
  } finally {
    if (coverPath) await unlink(coverPath).catch(() => {})
  }

  if (Platform.OS == 'android') {
    await RNFS.scanFile(filePath).catch((error) => {
      console.warn('刷新系统媒体库失败', error)
      warnings.push('媒体库刷新')
    })
  }

  return { path: filePath, warnings }
}

export default memo(({ renderButton }: Props) => {
  const theme = useTheme()
  const playMusicInfo = usePlayMusicInfo()
  const qualityDialogRef = useRef<DialogType>(null)
  const selectedDownloadMusicRef = useRef<LX.Music.MusicInfoOnline | null>(null)
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([])

  const handleDownloadWithQuality = useCallback(async(quality: DownloadQuality) => {
    const currentMusicInfo = selectedDownloadMusicRef.current
    if (!currentMusicInfo) {
      toast('音乐信息不存在')
      return
    }
    if (activeDownloadTask) {
      toast('已有下载任务正在进行')
      return
    }

    const run = async() => {
      if (Platform.OS == 'android') {
        const hasPermission = await requestStoragePermission()
        if (!hasPermission) {
          toast('请先授权存储权限')
          return
        }
      }

      try {
        toast(`开始下载 ${qualityLabels[quality]}`)
        const result = await downloadMusic(currentMusicInfo, quality)
        const warningText = result.warnings.length ? `（部分附加信息处理失败：${result.warnings.join('、')}）` : ''
        toast(`下载完成${warningText}: ${result.path}`, 'long')
      } catch (error) {
        console.error('下载失败:', error)
        toast(`下载失败: ${error instanceof Error ? error.message : String(error)}`, 'long')
      }
    }

    const task = run()
    activeDownloadTask = task
    void task.finally(() => {
      if (activeDownloadTask == task) activeDownloadTask = null
    })
  }, [])

  const handleDownload = useCallback(() => {
    const currentMusicInfo = playMusicInfo.musicInfo
    if (!currentMusicInfo) {
      toast('音乐信息不存在')
      return
    }
    if ('progress' in currentMusicInfo || currentMusicInfo.source == 'local') {
      toast('本地音乐无需下载')
      return
    }

    const availableQualitys = (QUALITYS as DownloadQuality[])
      .filter(quality => Boolean(currentMusicInfo.meta._qualitys[quality]))
      .map(quality => ({ quality, size: getQualitySize(currentMusicInfo, quality) }))
    if (!availableQualitys.length) {
      toast('没有可用的音质')
      return
    }

    selectedDownloadMusicRef.current = currentMusicInfo
    setQualityOptions(availableQualitys)
    requestAnimationFrame(() => qualityDialogRef.current?.setVisible(true))
  }, [playMusicInfo])

  return (
    <>
      {renderButton(handleDownload)}
      <Dialog ref={qualityDialogRef} title="选择下载音质">
        <ScrollView style={styles.qualityList}>
          {qualityOptions.map(({ quality, size }) => (
            <Button
              key={quality}
              style={{ ...styles.qualityButton, backgroundColor: theme['c-button-background'] }}
              onPress={() => {
                qualityDialogRef.current?.setVisible(false)
                void handleDownloadWithQuality(quality)
              }}
            >
              <Text color={theme['c-button-font']}>{`${qualityLabels[quality]}（${size}）`}</Text>
            </Button>
          ))}
        </ScrollView>
      </Dialog>
    </>
  )
})

const styles = StyleSheet.create({
  qualityList: {
    maxHeight: 360,
    padding: 10,
  },
  qualityButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 4,
  },
})
