import { NextcloudStorageProvider } from '../storage/nextcloud.provider';

describe('NextcloudStorageProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates parent folders and stores root-prefixed paths only once', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 201,
          headers: { etag: '"file-etag"', 'oc-fileid': 'file-123' },
        })
      );
    const provider = new NextcloudStorageProvider(
      'http://localhost:8080/',
      'service user',
      'secret'
    );

    const result = await provider.putObject(
      'BuramLoop/IncomingLots/lot 1.pdf',
      Buffer.from('file'),
      'application/pdf',
      'abc123'
    );

    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      ['http://localhost:8080/remote.php/dav/files/service%20user/BuramLoop', 'MKCOL'],
      ['http://localhost:8080/remote.php/dav/files/service%20user/BuramLoop/IncomingLots', 'MKCOL'],
      ['http://localhost:8080/remote.php/dav/files/service%20user/BuramLoop/IncomingLots/lot%201.pdf', 'PUT'],
    ]);
    expect(result.path).toBe('BuramLoop/IncomingLots/lot 1.pdf');
    expect(result.fileId).toBe('file-123');
  });

  it('fails upload when a directory cannot be created', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const provider = new NextcloudStorageProvider(
      'http://localhost:8080',
      'service',
      'secret'
    );

    await expect(
      provider.putObject('IncomingLots/file.pdf', Buffer.from('file'), 'application/pdf', 'abc123')
    ).rejects.toThrow('Nextcloud WebDAV MKCOL failed with HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects traversal paths and reports non-not-found stat errors', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const provider = new NextcloudStorageProvider(
      'http://localhost:8080',
      'service',
      'secret'
    );

    await expect(provider.statObject('../private/file.pdf')).rejects.toThrow(
      'Storage paths cannot contain "." or ".." segments.'
    );
    await expect(provider.statObject('IncomingLots/file.pdf')).rejects.toThrow(
      'Nextcloud WebDAV PROPFIND failed with HTTP 403'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
