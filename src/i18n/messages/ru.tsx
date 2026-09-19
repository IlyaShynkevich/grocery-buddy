import type { ReactNode } from 'react'
import type { Messages } from './en'

const pluralRules = new Intl.PluralRules('ru')

/** "1 товар", "2 товара", "5 товаров" — Russian has three count forms. */
const n = (count: number, one: string, few: string, many: string) => {
  const rule = pluralRules.select(count)
  return `${count} ${rule === 'one' ? one : rule === 'few' ? few : many}`
}

const items = (count: number) => n(count, 'товар', 'товара', 'товаров')

export const ru: Messages = {
  nav: {
    shopping: 'Список покупок',
    history: 'История',
    stats: 'Статистика',
    customize: 'Настройки',
    home: 'Главная',
    about: 'О приложении',
  },

  common: {
    add: 'Добавить',
    cancel: 'Отмена',
    dismiss: 'Закрыть',
    yesDelete: 'Да, удалить',
    essential: 'необходимое',
    nonEssential: 'необязательное',
    total: (price) => `Итого: ${price}`,
    remove: (name) => `Удалить «${name}»`,
  },

  categories: {
    produce: 'Овощи и фрукты',
    dairy: 'Молочные продукты',
    meat_seafood: 'Мясо и морепродукты',
    bakery: 'Хлеб и выпечка',
    frozen: 'Заморозка',
    pantry: 'Бакалея',
    household: 'Хозтовары',
    personal_care: 'Личная гигиена',
    snacks: 'Снеки и сладости',
    drinks: 'Напитки',
    other: 'Другое',
  },

  home: {
    cta: 'Начать покупки',
  },

  footer: {
    mascotAlt: 'Талисман Grocery Buddy',
  },

  shopping: {
    title: 'Список покупок',
    saveTrip: 'Сохранить поход',
    loadingTrip: 'Загрузка…',
    unprocessedHint: (count) =>
      count === 1 ? 'Сначала обработайте или удалите фото чека' : `Сначала обработайте или удалите фото чеков (${count})`,
    unprocessedTitle: (hint) => `${hint} — иначе он так и не будет распознан`,
    reviewHint: 'Сначала проверьте чек',
    reviewTitle: 'Проверьте распознанный чек ниже, прежде чем сохранять поход',
    saveFailed: (message) => `Поход не сохранён: ${message}`,
    hideList: 'Скрыть список',
    showList: 'Показать список',
    addPlaceholder: 'Добавить товар…',
    itemNameLabel: 'Название товара',
    empty: 'Пока пусто — добавьте, что нужно купить.',
    markGrabbed: (name) => `Отметить «${name}» как взятое`,
    markNotGrabbed: (name) => `Снять отметку с «${name}»`,
    editItem: (name) => `Изменить «${name}»`,
  },

  capture: {
    title: 'Чек',
    addPhoto: 'Добавить фото чека',
    camera: 'Камера',
    gallery: 'Выбрать из галереи',
    waiting: 'Ждём фото…',
    preparing: 'Готовим фото…',
    stopWaiting: 'Больше не ждать фото',
    empty: 'Чеков пока нет.',
    pickerUnavailable: 'Выбор фото недоступен — перезагрузите приложение и попробуйте снова.',
    photoNotSaved: (message) => `Фото не сохранено: ${message}`,
    status: {
      pending: 'Ожидает обработки',
      processing: 'Обработка…',
      failed: 'Ошибка — повторим',
      done: 'Обработан',
    },
    retryingIn: (seconds) => `Повтор через ${seconds} с`,
    demoMode: 'Демо-режим',
    retry: 'Повторить',
    process: 'Обработать',
    removeReceipt: 'Удалить чек',
    thumbnailAlt: 'Миниатюра чека',
    noPhoto: 'нет фото',
    noPhotoTitle: 'Фото не сохранялось в резервной копии, из которой восстановлен этот чек',
    unreadablePhoto: (type, sizeMb, detail) => `Не удалось прочитать фото (${type}, ${sizeMb} МБ): ${detail}`,
    unknownType: 'неизвестный тип',
    canvasUnsupported: 'Этот браузер не поддерживает Canvas',
    encodeFailed: (width, height) => `Не удалось сохранить фото ${width}×${height} в JPEG`,
  },

  extractionErrors: {
    demo: 'Распознавание чеков отключено в этой публичной демоверсии. Это личный проект — как запустить его со своим API-ключом, описано в README.',
    truncated: 'В чеке слишком много позиций для одного раза — попробуйте разделить его на два фото',
    tokenLimit: 'Фото чека слишком большое для текущего тарифа — попробуйте более чёткое или меньшее фото',
    rateLimited: 'Слишком много запросов — повторим автоматически',
    unreadable: 'Не удалось распознать чек — попробуйте ещё раз',
    connection: 'Проблема со связью — попробуйте ещё раз',
    generic: 'Что-то пошло не так — попробуйте ещё раз',
  },

  review: {
    titleMatches: 'Проверьте чек',
    titleFound: 'Вот что нашлось',
    confirm: 'Подтвердить',
    dismiss: 'Закрыть проверку',
    matchQuestion: (typed: ReactNode, scanned: ReactNode, price: string): ReactNode => (
      <>
        {typed} и {scanned} ({price}) — это одно и то же?
      </>
    ),
    yesSame: 'Да, одно и то же',
    noKeepBoth: 'Нет, оставить оба',
    date: (date) => `Дата: ${date}`,
    dateUnreadable: (detail) =>
      `Не удалось прочитать дату чека (${detail}) — у похода останется текущая дата, если не выбрать другую в «Показать товары».`,
    dateSaveFailed: (message) => `Не удалось сохранить дату: ${message}`,
    hideItems: 'Скрыть товары ▾',
    showItems: 'Показать товары ▸',
    purchaseDate: 'Дата покупки',
    priceFor: (name) => `Цена «${name}»`,
  },

  history: {
    title: 'История',
    empty: 'Сохранённых походов пока нет.',
    filterByMonth: 'Месяц:',
    allMonths: 'Все месяцы',
    tripSummary: (itemCount, price) => `${items(itemCount)} — ${price}`,
  },

  tripDetail: {
    back: '← К истории',
    deleteTrip: 'Удалить поход',
    confirmDeleteTrip: 'Удалить этот поход? Это нельзя отменить.',
    loading: 'Загрузка…',
    selected: (count) => `Выбрано: ${count}`,
    delete: 'Удалить',
    confirmBulkDelete: (count) => `Удалить ${items(count)}? Это нельзя отменить.`,
    confirmItemDelete: (name) => `Удалить «${name}»?`,
    markAs: (name, essential) => `Отметить «${name}» как ${essential ? 'необязательное' : 'необходимое'}`,
  },

  backup: {
    title: 'Резервная копия',
    intro: 'Походы и история хранятся только на этом устройстве. Сделайте копию перед очисткой данных браузера, удалением приложения или сменой телефона.',
    exportData: 'Экспорт',
    exporting: 'Экспорт…',
    importData: 'Импорт',
    exportFailed: (message) => `Не удалось экспортировать: ${message}`,
    importFailed: (message) => `Не удалось импортировать: ${message}`,
    confirmRestore: (fileName: string, summary: string): ReactNode => (
      <>
        Восстановить <strong>{fileName}</strong>? В файле: {summary}. Походы, товары, заметки и чеки с совпадающим id
        будут перезаписаны — это нельзя отменить.
      </>
    ),
    restoring: 'Восстановление…',
    yesRestore: 'Да, восстановить',
    restored: (summary, fileName) => `Восстановлено из ${fileName}: ${summary}.`,
    summary: (c) =>
      `${n(c.trips, 'поход', 'похода', 'походов')}, ${items(c.items)}, ${n(c.notes, 'заметка', 'заметки', 'заметок')}, ${n(c.receipts, 'чек', 'чека', 'чеков')} (с фото: ${c.withPhotos})`,
    errors: {
      notJson: (detail) => `Это не JSON-файл (${detail}).`,
      notObject: 'Это не резервная копия Grocery Buddy (ожидался JSON-объект).',
      noSchemaVersion: 'В файле нет schemaVersion — это не резервная копия Grocery Buddy.',
      newerSchema: (fileVersion, supported) =>
        `Эта копия сделана более новой версией Grocery Buddy (схема v${fileVersion}), чем поддерживает приложение (v${supported}). Обновите приложение и попробуйте снова.`,
      noTables: 'В файле нет раздела «tables» — это не резервная копия Grocery Buddy.',
      badTable: (key) => `Таблица «${key}» в файле отсутствует или повреждена — это не резервная копия Grocery Buddy.`,
      receiptNotObject: (entry) => `Запись чека ${entry} в файле не является объектом — копия повреждена. Ничего не импортировано.`,
      receiptLabel: (id) => `Чек №${id}`,
      unknownStatus: (label, status) => `${label}: неизвестный статус (${status}) — копия повреждена. Ничего не импортировано.`,
      missingPhoto: (label, status) =>
        `${label} (${status}) без фото, поэтому его нельзя будет обработать после восстановления — копия неполная или повреждена. Ничего не импортировано.`,
      invalidPhoto: (label) =>
        `${label}: фото не является изображением (ожидался URL «data:image/…» в base64) — копия повреждена. Ничего не импортировано.`,
      photoNotDataUrl: (id) => `Фото чека №${id} не является data-URL изображения — ничего не импортировано.`,
      photoUndecodable: (id, status) => `Фото чека №${id} не удалось декодировать (${status}) — ничего не импортировано.`,
      photoNotImage: (id, bytes, type) => `Фото чека №${id} — это ${bytes} байт типа ${type}, а не изображение — ничего не импортировано.`,
      exportMissingPhoto: (id, status) => `Чек №${id} (${status}) без фото — его нельзя обработать, поэтому его нельзя сохранить в копию как есть.`,
    },
  },

  saveTripErrors: {
    unfinishedReceipts: (count, detail) => `Поход пока нельзя сохранить — чеки ждут обработки или проверки (${count}): ${detail}`,
    reviewOpen: ', проверка не завершена',
  },

  cleanup: {
    freed: (mb, removed) =>
      `Освобождено ${mb} МБ: удалено фото чеков из сохранённых походов (${removed}) — после сохранения похода они больше не нужны.`,
    keptUnfinished: (count) => `Не тронуто чеков в сохранённых походах: ${count} — они не были полностью обработаны.`,
    failed: (message) =>
      `Не удалось удалить старые фото чеков: ${message}. Ничего не удалено — попробуем снова при следующем запуске.`,
  },

  stats: {
    title: 'Статистика',
    noTrips: 'Сохранённых походов пока нет — сохраните поход, чтобы увидеть статистику.',
    month: 'Месяц:',
    noTripsThisMonth: 'В этом месяце нет сохранённых походов.',
    totalSpend: 'Всего потрачено',
    essentialVsNon: 'Необходимое и необязательное',
    essential: 'Необходимое',
    nonEssential: 'Необязательное',
    byCategory: 'По категориям',
    noItemsThisMonth: 'В этом месяце покупок нет.',
  },

  customize: {
    title: 'Настройки',
    region: 'Язык и валюта',
    regionSaveFailed: (message) => `Язык сменился, но не сохранится до следующего запуска: ${message}`,
    intro: 'Отметьте в каждой категории товары, которые для вас НЕ обязательны.',
    notesEmpty: 'Пока пусто — добавьте то, без чего можно обойтись.',
    notePlaceholder: 'напр. наггетсы, замороженная пицца',
    addNoteFor: (category) => `Добавить заметку для «${category}»`,
    removeNote: (text) => `Удалить заметку: ${text}`,
  },

  about: {
    features: [
      'Составляйте список покупок до или во время похода и отмечайте, что уже взяли.',
      'Сканируйте чек (камерой или из галереи) — ИИ распознает товары, цены и категории.',
      'Проверяйте и подтверждайте каждый чек — список не изменится без вашего согласия.',
      'Смотрите историю походов по месяцам; удаляйте лишние товары или целый поход.',
      'Смотрите статистику за месяц: необходимые и необязательные траты, траты по категориям.',
      'Отметьте в «Настройках», что для вас необходимо в каждой категории.',
      'Сохраняйте всё в файл и восстанавливайте на новом устройстве.',
    ],
    access: 'Доступ к рабочей версии защищён общим паролем.',
    planned: 'В планах: динамика трат и сравнение месяцев.',
  },
}
